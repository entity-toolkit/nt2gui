import { IFieldMetadata, ILineConfig, IPlotter, IRange } from "./global";

/** Field names a quantity stands for: a vector's components, or the field itself. */
export const expandQuantity = (
  metadata: IFieldMetadata,
  quantity: string,
): string[] => {
  if (metadata.fields.some((field) => field.name === quantity)) {
    return [quantity];
  }
  return (
    metadata.vectors.find((vector) => vector.name === quantity)?.components ??
    []
  );
};

/**
 * Spatial dimensions of the selected quantities, in first-seen order. With
 * nothing selected, every dimension of the simulation is available.
 */
export const quantityDims = (
  metadata: IFieldMetadata,
  quantities: string[],
): string[] => {
  const dims: string[] = [];
  const add = (fieldDims: string[]) =>
    fieldDims.forEach((dim) => dims.includes(dim) || dims.push(dim));

  if (!quantities.length) {
    metadata.fields.forEach((field) => add(field.dims));
    return dims;
  }
  quantities
    .flatMap((quantity) => expandQuantity(metadata, quantity))
    .forEach((name) => {
      const field = metadata.fields.find((f) => f.name === name);
      if (field) add(field.dims);
    });
  return dims;
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

/** Index of the value closest to `target` (0 for an empty list). */
export const nearestIndex = (values: number[], target: number): number => {
  let best = 0;
  values.forEach((value, index) => {
    if (Math.abs(value - target) < Math.abs(values[best] - target)) best = index;
  });
  return best;
};

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

/** A plot config with the slice position for `dim` updated. */
export const withSlice = <T extends { slices?: Record<string, number> }>(
  config: T,
  dim: string,
  value: number,
): T =>
  config.slices?.[dim] === value
    ? config
    : { ...config, slices: { ...config.slices, [dim]: value } };

/** Finite [min, max] of the given values, or null if there are none. */
export const extentOf = (
  values: Iterable<number | null>,
): [number, number] | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : null;
};

/**
 * Value-axis domain: user limits where given, the padded data extent
 * elsewhere. Limits that would invert the axis are ignored.
 */
export const valueDomain = (
  extent: [number, number] | null,
  yMin?: number,
  yMax?: number,
): { domain: [number, number]; fixed: boolean } => {
  const [autoMin, autoMax] = extent ? paddedExtent(extent) : [0, 1];
  const min = yMin ?? autoMin;
  const max = yMax ?? autoMax;
  if ((yMin === undefined && yMax === undefined) || min >= max) {
    return { domain: [autoMin, autoMax], fixed: false };
  }
  return { domain: [min, max], fixed: true };
};

/** The part of a line config the server needs; display-only limits excluded. */
export const lineRequest = ({ quantities, axis, slices }: ILineConfig) => ({
  quantities,
  axis,
  slices,
});

/** Pads a value extent so lines don't touch the frame; flat lines get ±1 (or ±10%). */
export const paddedExtent = ([min, max]: [number, number]): [number, number] => {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
};
