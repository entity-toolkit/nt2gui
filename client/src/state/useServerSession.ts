import { Model } from "flexlayout-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchState, putState } from "../api/state";
import { serverErrorMessage } from "../api/http";
import { IServerSnapshot } from "../api/types";
import { ISimulation, IUiState } from "./schema";
import { StateSync, SyncStatus } from "./StateSync";

const BOOTSTRAP_RETRY_MAX_MS = 10_000;

/**
 * The UI state owned by the server. It is loaded once (nothing renders until
 * it arrives) and from then on every local change flows through a single
 * `StateSync` (debounced, serialized, retried). Server-side changes — revision
 * conflicts or commands such as loading a simulation — come back as snapshots
 * and replace the local state.
 */
export const useServerSession = () => {
  const [model, setModel] = useState<Model | null>(null);
  const [uiState, setUiState] = useState<IUiState | null>(null);
  const [simulations, setSimulations] = useState<ISimulation[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [loadError, setLoadError] = useState<string | null>(null);
  const syncRef = useRef<StateSync | null>(null);
  // Serialized layout the current flexlayout model was built from.
  const layoutRef = useRef<string | null>(null);

  const applySnapshot = useCallback((snapshot: IServerSnapshot) => {
    // Rebuilding the flexlayout model remounts every panel, so only do it
    // when the layout itself changed.
    const layout = JSON.stringify(snapshot.state.layout);
    if (layout !== layoutRef.current) {
      layoutRef.current = layout;
      setModel(Model.fromJson(snapshot.state.layout));
    }
    setUiState(snapshot.state);
    setSimulations(snapshot.simulations);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt: number) => {
      try {
        const snapshot = await fetchState();
        if (cancelled) return;
        syncRef.current = new StateSync(snapshot, {
          push: putState,
          onRemoteSnapshot: applySnapshot,
          onStatusChange: setSyncStatus,
        });
        setLoadError(null);
        applySnapshot(snapshot);
      } catch (error) {
        if (cancelled) return;
        setLoadError(serverErrorMessage(error));
        retryTimer = setTimeout(
          () => void load(attempt + 1),
          Math.min(1000 * 2 ** attempt, BOOTSTRAP_RETRY_MAX_MS),
        );
      }
    };
    void load(0);

    // Catch up with changes made elsewhere (another tab, a server restart).
    const onFocus = () => void syncRef.current?.refresh(fetchState);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      window.removeEventListener("focus", onFocus);
      syncRef.current?.dispose();
      syncRef.current = null;
    };
  }, [applySnapshot]);

  // The one place local state is sent to the server.
  useEffect(() => {
    if (uiState) syncRef.current?.schedule(uiState);
  }, [uiState]);

  const updateUiState = useCallback((update: (prev: IUiState) => IUiState) => {
    setUiState((prev) => (prev ? update(prev) : prev));
  }, []);

  /** Tells the session the flexlayout model changed (the layout is part of the state). */
  const setLayout = useCallback(
    (layout: IUiState["layout"], update: (prev: IUiState) => IUiState) => {
      layoutRef.current = JSON.stringify(layout);
      updateUiState(update);
    },
    [updateUiState],
  );

  /** Run a server command (e.g. load a simulation) and adopt its result. */
  const runServerCommand = useCallback(
    async <T extends IServerSnapshot>(command: () => Promise<T>) => {
      const sync = syncRef.current;
      if (!sync) throw new Error("Not connected to the server yet");
      return sync.run(command);
    },
    [],
  );

  /** Resolves once every local change has reached the server. */
  const flushState = useCallback(async () => {
    const sync = syncRef.current;
    if (!sync) throw new Error("Not connected to the server yet");
    await sync.flush();
    if (sync.hasPendingChanges) {
      throw new Error(
        "Cannot reach the server; latest changes are not saved yet",
      );
    }
  }, []);

  return {
    model,
    uiState,
    simulations,
    syncStatus,
    loadError,
    updateUiState,
    setLayout,
    runServerCommand,
    flushState,
  };
};
