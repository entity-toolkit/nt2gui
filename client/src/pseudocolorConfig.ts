import { IFieldMetadata, IPseudocolorConfig } from "./global";

/** A pseudocolor plot needs at least two spatial dimensions. */
export const isPseudocolorField = (field: IFieldMetadata["fields"][number]) =>
  field.dims.length >= 2;

/** Dimensions offered for the axes: the field's own, or all if none is chosen. */
export const fieldDims = (metadata: IFieldMetadata, field: string): string[] => {
  const match = metadata.fields.find((f) => f.name === field);
  if (match) return match.dims;
  const dims: string[] = [];
  metadata.fields.forEach((f) =>
    f.dims.forEach((dim) => dims.includes(dim) || dims.push(dim)),
  );
  return dims;
};

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
  ...validAxes(fieldDims(metadata, field), config.xCoordinate, config.yCoordinate),
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
