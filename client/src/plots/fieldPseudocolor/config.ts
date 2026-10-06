/** Settings helpers for 2D (pseudocolor) plots of fields. */
import { IFieldMetadata } from "../../api/types";
import {
  IPlotter,
  IPseudocolorConfig,
  IUiState,
  IZoomWindow,
} from "../../state/schema";
import { quantityDims } from "../fields/metadata";

export const defaultPseudocolorConfig: IPseudocolorConfig = {
  field: "",
  xCoordinate: "x",
  yCoordinate: "y",
  colorMap: "viridis",
};

/** A pseudocolor plot needs at least two spatial dimensions. */
export const isPseudocolorField = (field: IFieldMetadata["fields"][number]) =>
  field.dims.length >= 2;

/** Dimensions offered for the axes: the field's own, or all if none is chosen. */
export const fieldDims = (metadata: IFieldMetadata, field: string): string[] =>
  quantityDims(
    metadata,
    metadata.fields.some((f) => f.name === field) ? [field] : [],
  );

/**
 * A valid (x, y) pair of distinct dims, keeping the current choice wherever
 * it is still valid.
 */
export const validAxes = (
  dims: string[],
  x: string,
  y: string,
): { xCoordinate: string; yCoordinate: string } => {
  const xCoordinate = dims.includes(x) ? x : (dims[0] ?? x);
  const yCoordinate =
    dims.includes(y) && y !== xCoordinate
      ? y
      : (dims.find((dim) => dim !== xCoordinate) ?? y);
  return { xCoordinate, yCoordinate };
};

/**
 * Dims of the selected field beyond the two plotted ones (3D data): each is
 * sliced and gets a slider.
 */
export const pseudocolorSliceDims = (
  metadata: IFieldMetadata,
  config: IPseudocolorConfig,
): string[] => {
  const field = metadata.fields.find((f) => f.name === config.field);
  if (!field) return [];
  return field.dims.filter(
    (dim) => dim !== config.xCoordinate && dim !== config.yCoordinate,
  );
};

/** Selects a field and adjusts the axes to dims it actually has. */
export const withField = (
  config: IPseudocolorConfig,
  field: string,
  metadata: IFieldMetadata,
): IPseudocolorConfig => ({
  ...config,
  field,
  ...validAxes(
    fieldDims(metadata, field),
    config.xCoordinate,
    config.yCoordinate,
  ),
});

/** Sets one axis; picking the other axis's dim swaps the two. */
export const withCoordinate = (
  config: IPseudocolorConfig,
  axis: "x" | "y",
  dim: string,
): IPseudocolorConfig => {
  const [own, other] =
    axis === "x"
      ? (["xCoordinate", "yCoordinate"] as const)
      : (["yCoordinate", "xCoordinate"] as const);
  if (config[own] === dim) return config;
  return {
    ...config,
    [own]: dim,
    ...(config[other] === dim ? { [other]: config[own] } : {}),
  };
};

const sameWindow = (a: IZoomWindow | null, b: IZoomWindow | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.xMin === b.xMin &&
    a.xMax === b.xMax &&
    a.yMin === b.yMin &&
    a.yMax === b.yMax);

/** The zoom in effect: the shared one for synced plots, else the plot's own. */
export const activeViewport = (
  plotter: IPlotter,
  globalViewport: IZoomWindow | null,
): IZoomWindow | null =>
  (plotter.useGlobalViewport ?? true)
    ? globalViewport
    : (plotter.localViewport ?? null);

/** Zoom a 2D field plot: synced plots share one viewport, others keep their own. */
export const withViewport = (
  state: IUiState,
  nodeId: string,
  viewport: IZoomWindow | null,
): IUiState => {
  const plotter = state.plotters[nodeId];
  if (!plotter) return state;
  if (plotter.useGlobalViewport ?? true) {
    return sameWindow(state.globalViewport, viewport)
      ? state
      : { ...state, globalViewport: viewport };
  }
  if (sameWindow(plotter.localViewport ?? null, viewport)) return state;
  return {
    ...state,
    plotters: {
      ...state.plotters,
      [nodeId]: { ...plotter, localViewport: viewport },
    },
  };
};
