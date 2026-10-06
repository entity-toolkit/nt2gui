import { useSyncExternalStore } from "react";

/** The hover position in one plot, mirrored as a crosshair in the others. */
export interface ICrosshair {
  x: number;
  y: number;
  /** Plot the pointer is over (it doesn't draw its own crosshair). */
  plotId: string;
  /** Only plots in the same group share a crosshair (same axes meaning). */
  group: string;
}

// Kept outside React state: pointer moves would otherwise re-render the app.
let current: ICrosshair | null = null;
const listeners = new Set<() => void>();

export const setCrosshair = (next: ICrosshair | null) => {
  if (next === null && current === null) return;
  current = next;
  listeners.forEach((listener) => listener());
};

/** Clears the crosshair only if `plotId` owns it. */
export const clearCrosshair = (plotId: string) => {
  if (current?.plotId === plotId) setCrosshair(null);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCrosshair = () =>
  useSyncExternalStore(subscribe, () => current);
