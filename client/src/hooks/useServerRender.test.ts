// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RENDER_DEBOUNCE_MS, useServerRender } from "./useServerRender";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A request whose calls can be resolved by hand, recording their signals. */
const controllable = () => {
  const calls: {
    key: string;
    signal: AbortSignal;
    resolve: (v: string) => void;
  }[] = [];
  const request = (key: string) => (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      calls.push({ key, signal, resolve });
      signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
  return { calls, request };
};

const setup = () => {
  const { calls, request } = controllable();
  const hook = renderHook(({ key }) => useServerRender(key, request(key)), {
    initialProps: { key: "a" },
  });
  return { calls, hook };
};

describe("useServerRender", () => {
  it("renders the first key right away", async () => {
    const { calls, hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(calls.map((c) => c.key)).toEqual(["a"]);

    await act(async () => calls[0].resolve("A"));
    expect(hook.result.current.data).toBe("A");
    expect(hook.result.current.isRendering).toBe(false);
  });

  it("sends one request for a burst of changes, once they settle", async () => {
    const { calls, hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => calls[0].resolve("A"));

    for (const key of ["b", "c", "d"]) {
      hook.rerender({ key });
      await act(() => vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS / 3));
    }
    expect(calls.map((c) => c.key)).toEqual(["a"]);
    expect(hook.result.current.data).toBe("A"); // the old result stays visible

    await act(() => vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS));
    expect(calls.map((c) => c.key)).toEqual(["a", "d"]);
  });

  it("aborts the request in flight when a newer one starts, without an error", async () => {
    const { calls, hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(async () => calls[0].resolve("A"));

    hook.rerender({ key: "b" });
    await act(() => vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS));
    hook.rerender({ key: "c" });
    await act(() => vi.advanceTimersByTimeAsync(RENDER_DEBOUNCE_MS));

    expect(calls[1].signal.aborted).toBe(true);
    expect(calls[2].signal.aborted).toBe(false);
    expect(hook.result.current.error).toBeNull();

    await act(async () => calls[2].resolve("C"));
    expect(hook.result.current.data).toBe("C");
  });

  it("aborts on unmount", async () => {
    const { calls, hook } = setup();
    await act(() => vi.advanceTimersByTimeAsync(0));
    hook.unmount();
    expect(calls[0].signal.aborted).toBe(true);
  });
});
