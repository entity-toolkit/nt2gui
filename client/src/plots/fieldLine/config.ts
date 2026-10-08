/** Settings helpers for 1D cuts through fields. */
import { ILineConfig, IPlotter, IRange, IUiState } from "../../state/schema";

export const defaultLineConfig: ILineConfig = {
  quantities: [],
  axis: "",
  slices: {},
};

/** The coordinate to plot against: the configured one if valid, else the first. */
export const effectiveAxis = (axis: string, dims: string[]): string =>
  dims.includes(axis) ? axis : (dims[0] ?? "");

/** Dimensions that need a slice position (all but the plotted axis). */
export const sliceDims = (dims: string[], axis: string) =>
  dims.filter((dim) => dim !== axis);

export const toggleQuantity = (quantities: string[], quantity: string) =>
  quantities.includes(quantity)
    ? quantities.filter((q) => q !== quantity)
    : [...quantities, quantity];

/**
 * The zoom range in effect for a line plot. Synced plots share one range per
 * axis, so only 1D plots along the same coordinate zoom together.
 */
export const activeLineRange = (
  plotter: IPlotter | undefined,
  globalLineViewports: Record<string, IRange>,
  axis: string,
): IRange | null => {
  if (plotter?.useGlobalViewport ?? true) {
    return globalLineViewports[axis] ?? null;
  }
  return plotter?.lineViewport ?? null;
};

/** Sets or clears the synced range for one axis, leaving the others alone. */
export const withAxisRange = (
  viewports: Record<string, IRange>,
  axis: string,
  range: IRange | null,
): Record<string, IRange> => {
  const current = viewports[axis];
  if (range === null) {
    if (!current) return viewports;
    const next = { ...viewports };
    delete next[axis];
    return next;
  }
  if (current && current.min === range.min && current.max === range.max) {
    return viewports;
  }
  return { ...viewports, [axis]: range };
};

/** The part of a line config the server needs; display-only limits excluded. */
export const lineRequest = ({
  quantities,
  axis,
  slices,
  smoothing,
}: ILineConfig) => ({
  quantities,
  axis,
  slices,
  ...(smoothing && Object.keys(smoothing).length ? { smoothing } : {}),
});

/**
 * Zoom a line plot along its axis. Synced plots write the shared range for
 * that axis; unsynced ones keep their own.
 */
export const withLineRange = (
  state: IUiState,
  nodeId: string,
  axis: string,
  range: IRange | null,
): IUiState => {
  const plotter = state.plotters[nodeId];
  if (!plotter) return state;
  if (plotter.useGlobalViewport ?? true) {
    const globalLineViewports = withAxisRange(
      state.globalLineViewports,
      axis,
      range,
    );
    return globalLineViewports === state.globalLineViewports
      ? state
      : { ...state, globalLineViewports };
  }
  const current = plotter.lineViewport ?? null;
  if (current?.min === range?.min && current?.max === range?.max) return state;
  return {
    ...state,
    plotters: {
      ...state.plotters,
      [nodeId]: { ...plotter, lineViewport: range },
    },
  };
};
