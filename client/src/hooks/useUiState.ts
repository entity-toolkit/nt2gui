import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Model } from "flexlayout-react";
import {
  DataType,
  IPlotters,
  IServerSnapshot,
  IUiState,
  ITimeline,
  IPseudocolorConfig,
  IZoomWindow,
  ILineConfig,
  IRange,
  PlotType,
  IPlotter,
  defaultLineConfig,
  defaultParticleHistogramConfig,
  defaultParticlePhaseConfig,
  defaultPseudocolorConfig,
} from "../global";
import { withAxisRange } from "../lineConfig";
import { collectPanelIds, reconcilePlotters } from "../plotterSync";
import { fetchState, putState } from "../services/uiStateService";
import { StateSync, SyncStatus } from "../sync/StateSync";

const viewportsEqual = (a: IZoomWindow | null, b: IZoomWindow | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.xMin === b.xMin &&
    a.xMax === b.xMax &&
    a.yMin === b.yMin &&
    a.yMax === b.yMax
  );
};

const BOOTSTRAP_RETRY_MAX_MS = 10_000;

/**
 * UI state owned by the server. The hook loads it once, renders nothing until
 * it arrives, and from then on every local change flows through a single
 * `StateSync` (debounced, serialized, retried). Server-side changes — revision
 * conflicts or commands such as loading a simulation — come back as snapshots
 * and replace the local state.
 */
export const useUiState = () => {
  const [model, setModel] = useState<Model | null>(null);
  const [uiState, setUiState] = useState<IUiState | null>(null);
  const [simulations, setSimulations] = useState<
    IServerSnapshot["simulations"]
  >([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [loadError, setLoadError] = useState<string | null>(null);
  const syncRef = useRef<StateSync | null>(null);
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
        setLoadError(error instanceof Error ? error.message : String(error));
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
    if (!uiState) return;
    layoutRef.current = JSON.stringify(uiState.layout);
    syncRef.current?.schedule(uiState);
  }, [uiState]);

  const updateUiState = useCallback(
    (updater: (prev: IUiState) => IUiState) => {
      setUiState((prev) => (prev ? updater(prev) : prev));
    },
    [],
  );

  const applyPlotterChange = useCallback(
    (updater: (prev: IPlotters) => IPlotters) => {
      updateUiState((prev) => {
        const plotters = updater(prev.plotters);
        return plotters === prev.plotters ? prev : { ...prev, plotters };
      });
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
      throw new Error("Cannot reach the server; latest changes are not saved yet");
    }
  }, []);

  const onPlotTypeChange = useCallback(
    (nodeId: string, newPlotType: PlotType) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (existing?.plotType === newPlotType) {
          return prev;
        }

        if (existing?.dataType === DataType.Particles) {
          return {
            ...prev,
            [nodeId]: {
              ...existing,
              plotType: newPlotType,
              particleHistogramConfig:
                newPlotType === PlotType.Line
                  ? (existing.particleHistogramConfig ??
                    defaultParticleHistogramConfig)
                  : existing.particleHistogramConfig,
              particlePhaseConfig:
                newPlotType === PlotType.Pseudocolor
                  ? (existing.particlePhaseConfig ?? defaultParticlePhaseConfig)
                  : existing.particlePhaseConfig,
            },
          };
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            plotType: newPlotType,
            dataType: existing?.dataType ?? DataType.None,
            useGlobalViewport: existing?.useGlobalViewport ?? true,
            localViewport: existing?.localViewport ?? null,
            pseudocolorConfig:
              newPlotType === PlotType.Pseudocolor
                ? (existing?.pseudocolorConfig ?? {
                    ...defaultPseudocolorConfig,
                  })
                : existing?.pseudocolorConfig,
            lineConfig:
              newPlotType === PlotType.Line
                ? (existing?.lineConfig ?? { ...defaultLineConfig })
                : existing?.lineConfig,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onDataTypeChange = useCallback(
    (nodeId: string, newDataType: DataType) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (existing?.dataType === newDataType) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            plotType: existing?.plotType ?? PlotType.None,
            dataType: newDataType,
            useGlobalViewport: existing?.useGlobalViewport ?? true,
            localViewport: existing?.localViewport ?? null,
            pseudocolorConfig: existing?.pseudocolorConfig,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const handleModelChange = useCallback(
    (updatedModel: Model) => {
      const layout = updatedModel.toJson();
      const panelIds = collectPanelIds(layout);
      updateUiState((prev) => ({
        ...prev,
        layout,
        plotters: reconcilePlotters(prev.plotters, panelIds),
      }));
    },
    [updateUiState],
  );

  const onPseudocolorConfigChange = useCallback(
    (nodeId: string, config: IPseudocolorConfig) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            pseudocolorConfig: config,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onPlotSimulationChange = useCallback(
    (nodeId: string, simulationId?: string) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing || existing.simulationId === simulationId) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            simulationId,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onTimelineChange = useCallback(
    (timeline: ITimeline) => {
      updateUiState((prev) => ({ ...prev, timeline }));
    },
    [updateUiState],
  );

  const onGlobalViewportChange = useCallback(
    (viewport: IZoomWindow | null) => {
      updateUiState((prev) =>
        viewportsEqual(prev.globalViewport, viewport)
          ? prev
          : { ...prev, globalViewport: viewport ?? null },
      );
    },
    [updateUiState],
  );

  /** Merge settings into one plot (used by the particle plots). */
  const onPlotterPatch = useCallback(
    (nodeId: string, patch: Partial<IPlotter>) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing) return prev;
        return { ...prev, [nodeId]: { ...existing, ...patch } };
      });
    },
    [applyPlotterChange],
  );

  const onLineConfigChange = useCallback(
    (nodeId: string, config: ILineConfig) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing || existing.lineConfig === config) return prev;
        return { ...prev, [nodeId]: { ...existing, lineConfig: config } };
      });
    },
    [applyPlotterChange],
  );

  /**
   * Zoom a line plot along its axis. Synced plots write the shared range for
   * that axis; unsynced ones keep their own.
   */
  const onLineRangeChange = useCallback(
    (nodeId: string, axis: string, range: IRange | null) => {
      updateUiState((prev) => {
        const existing = prev.plotters[nodeId];
        if (!existing) return prev;
        if (existing.useGlobalViewport ?? true) {
          const globalLineViewports = withAxisRange(
            prev.globalLineViewports,
            axis,
            range,
          );
          return globalLineViewports === prev.globalLineViewports
            ? prev
            : { ...prev, globalLineViewports };
        }
        const current = existing.lineViewport ?? null;
        if (current?.min === range?.min && current?.max === range?.max) {
          return prev;
        }
        return {
          ...prev,
          plotters: {
            ...prev.plotters,
            [nodeId]: { ...existing, lineViewport: range },
          },
        };
      });
    },
    [updateUiState],
  );

  const onLocalViewportChange = useCallback(
    (nodeId: string, viewport: IZoomWindow | null) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing) {
          return prev;
        }

        if (viewportsEqual(existing.localViewport ?? null, viewport)) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            localViewport: viewport ?? null,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onSyncViewportToggle = useCallback(
    (nodeId: string, useGlobal: boolean) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing || existing.useGlobalViewport === useGlobal) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            useGlobalViewport: useGlobal,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  return useMemo(
    () => ({
      model,
      uiState,
      simulations,
      syncStatus,
      loadError,
      runServerCommand,
      flushState,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
      onGlobalViewportChange,
      onLocalViewportChange,
      onSyncViewportToggle,
      onLineConfigChange,
      onLineRangeChange,
      onPlotterPatch,
      handleModelChange,
    }),
    [
      model,
      uiState,
      simulations,
      syncStatus,
      loadError,
      runServerCommand,
      flushState,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
      onGlobalViewportChange,
      onLocalViewportChange,
      onSyncViewportToggle,
      onLineConfigChange,
      onLineRangeChange,
      onPlotterPatch,
      handleModelChange,
    ],
  );
};
