import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Plot renders that are pending (waiting out the debounce, or in flight), per
 * scope — the layout panel they belong to. Playback advances only when none of
 * the panels it drives is rendering, so slow renders aren't skipped. Kept
 * outside React state: renders start and end constantly.
 */
const pending = new Map<string, number>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** The panel whose renders are being tracked ("" outside any panel). */
export const RenderScope = createContext("");

/** Marks a render as pending; call the returned function (once) when it settles. */
export const beginRender = (scope = ""): (() => void) => {
  pending.set(scope, (pending.get(scope) ?? 0) + 1);
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const count = (pending.get(scope) ?? 1) - 1;
    if (count > 0) pending.set(scope, count);
    else pending.delete(scope);
    notify();
  };
};

/** Whether any render is pending in a scope accepted by `include` (default: any). */
export const rendersPending = (include?: (scope: string) => boolean) => {
  for (const scope of pending.keys()) {
    if (!include || include(scope)) return true;
  }
  return false;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useRendersPending = (include?: (scope: string) => boolean) =>
  useSyncExternalStore(subscribe, () => rendersPending(include));

/** Starts renders in the current panel's scope. */
export const useRenderScope = () => useContext(RenderScope);
