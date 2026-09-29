import { IServerSnapshot, IUiState } from "../global";
import { HttpError } from "../services/http";
import { RevisionConflictError } from "../services/uiStateService";

export type SyncStatus = "synced" | "saving" | "offline" | "error";

export interface StateSyncOptions {
  push: (revision: number, state: IUiState) => Promise<IServerSnapshot>;
  /** The server's state replaced the local one (revision conflict or a server command). */
  onRemoteSnapshot: (snapshot: IServerSnapshot) => void;
  onStatusChange?: (status: SyncStatus) => void;
  debounceMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

/**
 * Keeps the server's copy of the UI state up to date.
 *
 * - Local changes are debounced and only the latest state is sent.
 * - All server traffic is serialized, so writes never race each other and
 *   each one carries the revision returned by the previous one.
 * - On a revision conflict the server wins: its state is handed back through
 *   `onRemoteSnapshot` and pending local changes are dropped.
 * - Network/server failures are retried with exponential backoff.
 */
export class StateSync {
  private revision: number;
  private lastSynced: string;
  private pending: IUiState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private status: SyncStatus = "synced";
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay: number;
  private disposed = false;

  constructor(
    initial: IServerSnapshot,
    private readonly options: StateSyncOptions,
  ) {
    this.revision = initial.revision;
    this.lastSynced = JSON.stringify(initial.state);
    this.retryDelay = options.retryBaseMs ?? 1000;
  }

  get currentRevision() {
    return this.revision;
  }

  /** Queue the latest local state to be sent once edits settle. */
  schedule(state: IUiState) {
    if (this.disposed) return;
    const unchanged = JSON.stringify(state) === this.lastSynced;
    if (unchanged && !this.pending && this.busy === 0) return;

    this.pending = state;
    if (this.status !== "offline") this.setStatus("saving");
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(
      () => void this.flush(),
      this.options.debounceMs ?? 250,
    );
  }

  /** Send any pending state now. Resolves once the attempt finished. */
  flush(): Promise<void> {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    return this.enqueue(() => this.pushPending());
  }

  /**
   * Run a server command (e.g. loading a simulation) after pending local
   * changes are saved, then adopt the snapshot it returns.
   */
  async run(command: () => Promise<IServerSnapshot>): Promise<IServerSnapshot> {
    await this.flush();
    return this.enqueue(async () => {
      if (this.pending) {
        // Running now would silently discard the unsaved local changes.
        throw new Error("Cannot reach the server; local changes are not saved yet");
      }
      const snapshot = await command();
      this.adopt(snapshot);
      return snapshot;
    });
  }

  /** Pull the server state (e.g. on window focus) if nothing local is pending. */
  refresh(fetchSnapshot: () => Promise<IServerSnapshot>): Promise<void> {
    return this.enqueue(async () => {
      if (this.pending || this.disposed) return;
      try {
        const snapshot = await fetchSnapshot();
        if (snapshot.revision !== this.revision) this.adopt(snapshot);
        if (this.status === "offline") this.setStatus("synced");
      } catch {
        this.setStatus("offline");
      }
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.debounceTimer);
    clearTimeout(this.retryTimer);
  }

  private async pushPending() {
    while (this.pending && !this.disposed) {
      const state = this.pending;
      const serialized = JSON.stringify(state);
      this.pending = null;
      if (serialized === this.lastSynced) continue;

      try {
        const snapshot = await this.options.push(this.revision, state);
        this.revision = snapshot.revision;
        this.lastSynced = serialized;
        this.retryDelay = this.options.retryBaseMs ?? 1000;
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          this.adopt(error.snapshot);
          return;
        }
        if (
          error instanceof HttpError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          // The server rejected the state itself; retrying cannot help.
          console.error("Server rejected UI state:", error);
          this.setStatus("error");
          return;
        }
        // Keep the newest state for the retry unless a newer edit arrived.
        this.pending ??= state;
        this.setStatus("offline");
        this.scheduleRetry();
        return;
      }
    }
    if (!this.disposed) this.setStatus("synced");
  }

  private adopt(snapshot: IServerSnapshot) {
    this.revision = snapshot.revision;
    this.lastSynced = JSON.stringify(snapshot.state);
    this.pending = null;
    clearTimeout(this.debounceTimer);
    this.setStatus("synced");
    if (!this.disposed) this.options.onRemoteSnapshot(snapshot);
  }

  private scheduleRetry() {
    if (this.disposed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.flush(), this.retryDelay);
    this.retryDelay = Math.min(
      this.retryDelay * 2,
      this.options.retryMaxMs ?? 10_000,
    );
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.busy += 1;
    const result = this.queue.then(task).finally(() => {
      this.busy -= 1;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private setStatus(status: SyncStatus) {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
