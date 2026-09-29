import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IServerSnapshot, IUiState } from "../global";
import { HttpError } from "../services/http";
import { RevisionConflictError } from "../services/uiStateService";
import { StateSync, SyncStatus } from "./StateSync";

const makeState = (current = 0): IUiState => ({
  layout: { global: {}, layout: { type: "row", children: [] } },
  plotters: {},
  timeline: { current, min: 0, max: 100, step: 1 },
  globalViewport: null,
});

const snapshot = (revision: number, state = makeState()): IServerSnapshot => ({
  revision,
  state,
  simulations: [],
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A fake server that accepts every write and bumps the revision. */
const acceptingPush = () =>
  vi.fn(async (revision: number, state: IUiState) =>
    snapshot(revision + 1, state),
  );

const setup = (
  push: (revision: number, state: IUiState) => Promise<IServerSnapshot>,
  initial = snapshot(0),
) => {
  const onRemoteSnapshot = vi.fn();
  const statuses: SyncStatus[] = [];
  const sync = new StateSync(initial, {
    push,
    onRemoteSnapshot,
    onStatusChange: (status) => statuses.push(status),
    debounceMs: 100,
    retryBaseMs: 1000,
    retryMaxMs: 4000,
  });
  return { sync, onRemoteSnapshot, statuses };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StateSync", () => {
  it("coalesces rapid changes into one push of the latest state", async () => {
    const push = acceptingPush();
    const { sync, statuses } = setup(push);

    sync.schedule(makeState(1));
    sync.schedule(makeState(2));
    sync.schedule(makeState(3));
    await vi.advanceTimersByTimeAsync(99);
    expect(push).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(0, makeState(3));
    expect(statuses).toEqual(["saving", "synced"]);
  });

  it("does not push state identical to what the server has", async () => {
    const push = acceptingPush();
    const { sync } = setup(push);

    sync.schedule(makeState(0));
    await vi.advanceTimersByTimeAsync(500);

    expect(push).not.toHaveBeenCalled();
  });

  it("does not push when a change is reverted before the debounce fires", async () => {
    const push = acceptingPush();
    const { sync, statuses } = setup(push);

    sync.schedule(makeState(1));
    sync.schedule(makeState(0));
    await vi.advanceTimersByTimeAsync(500);

    expect(push).not.toHaveBeenCalled();
    expect(statuses).toEqual(["saving", "synced"]);
  });

  it("sends each write with the revision returned by the previous one", async () => {
    const push = acceptingPush();
    const { sync } = setup(push, snapshot(7));

    sync.schedule(makeState(1));
    await sync.flush();
    sync.schedule(makeState(2));
    await sync.flush();

    expect(push.mock.calls.map(([revision]) => revision)).toEqual([7, 8]);
    expect(sync.currentRevision).toBe(9);
  });

  it("never has two writes in flight; edits made meanwhile follow afterwards", async () => {
    const first = deferred<IServerSnapshot>();
    const push = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (revision: number, state: IUiState) =>
        snapshot(revision + 1, state),
      );
    const { sync } = setup(push);

    sync.schedule(makeState(1));
    await vi.advanceTimersByTimeAsync(100);
    sync.schedule(makeState(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(push).toHaveBeenCalledTimes(1);

    first.resolve(snapshot(1, makeState(1)));
    await vi.advanceTimersByTimeAsync(0);

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith(1, makeState(2));
  });

  it("adopts the server state on a revision conflict", async () => {
    const server = snapshot(5, makeState(42));
    const push = vi
      .fn()
      .mockRejectedValueOnce(new RevisionConflictError(server))
      .mockImplementation(async (revision: number, state: IUiState) =>
        snapshot(revision + 1, state),
      );
    const { sync, onRemoteSnapshot } = setup(push);

    sync.schedule(makeState(1));
    await sync.flush();

    expect(onRemoteSnapshot).toHaveBeenCalledWith(server);
    expect(sync.currentRevision).toBe(5);

    // Re-rendering with the adopted state must not echo it back.
    sync.schedule(makeState(42));
    await sync.flush();
    expect(push).toHaveBeenCalledTimes(1);

    sync.schedule(makeState(43));
    await sync.flush();
    expect(push).toHaveBeenLastCalledWith(5, makeState(43));
  });

  it("retries with backoff while the server is unreachable, sending the newest state", async () => {
    const push = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(async (revision: number, state: IUiState) =>
        snapshot(revision + 1, state),
      );
    const { sync, statuses } = setup(push);

    sync.schedule(makeState(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(statuses.at(-1)).toBe("offline");

    sync.schedule(makeState(2)); // edit while offline
    await vi.advanceTimersByTimeAsync(100); // debounced attempt fails
    expect(push).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1999);
    expect(push).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // backoff doubled to 2s

    expect(push).toHaveBeenCalledTimes(3);
    expect(push).toHaveBeenLastCalledWith(0, makeState(2));
    expect(statuses.at(-1)).toBe("synced");
  });

  it("does not retry states the server rejects as invalid", async () => {
    const push = vi.fn().mockRejectedValue(new HttpError(400, "bad"));
    const { sync, statuses } = setup(push);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    sync.schedule(makeState(1));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(push).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("error");
  });

  it("saves pending changes before running a command, then adopts its result", async () => {
    const calls: string[] = [];
    const push = vi.fn(async (revision: number, state: IUiState) => {
      calls.push("push");
      return snapshot(revision + 1, state);
    });
    const { sync, onRemoteSnapshot } = setup(push);
    const result = snapshot(2, makeState(9));

    sync.schedule(makeState(1));
    const returned = await sync.run(async () => {
      calls.push("command");
      return result;
    });

    expect(calls).toEqual(["push", "command"]);
    expect(returned).toBe(result);
    expect(onRemoteSnapshot).toHaveBeenCalledWith(result);
    expect(sync.currentRevision).toBe(2);
  });

  it("refuses to run a command while local changes cannot be saved", async () => {
    const push = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { sync } = setup(push);
    const command = vi.fn();

    sync.schedule(makeState(1));
    await expect(sync.run(command)).rejects.toThrow(/not saved/);

    expect(command).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("refresh adopts server state only when its revision moved", async () => {
    const { sync, onRemoteSnapshot } = setup(acceptingPush(), snapshot(3));

    await sync.refresh(async () => snapshot(3));
    expect(onRemoteSnapshot).not.toHaveBeenCalled();

    const newer = snapshot(0, makeState(5)); // e.g. session file was reset
    await sync.refresh(async () => newer);
    expect(onRemoteSnapshot).toHaveBeenCalledWith(newer);
  });

  it("stops all activity after dispose", async () => {
    const push = acceptingPush();
    const { sync } = setup(push);

    sync.schedule(makeState(1));
    sync.dispose();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(push).not.toHaveBeenCalled();
  });
});
