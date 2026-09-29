/** Field metadata helpers shared by the field plot kinds. */
import { IFieldMetadata } from "../../api/types";

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

/** A plot config with the slice position for `dim` updated. */
export const withSlice = <T extends { slices?: Record<string, number> }>(
  config: T,
  dim: string,
  value: number,
): T =>
  config.slices?.[dim] === value
    ? config
    : { ...config, slices: { ...config.slices, [dim]: value } };

/**
 * Metadata with the plot's custom expressions added as fields, so the axis,
 * slice and dimension helpers treat them like any other field. Expressions
 * whose dims are unknown (invalid, or still loading) are left out.
 */
export const withExpressionFields = (
  metadata: IFieldMetadata,
  expressionDims: Record<string, string[]>,
  expressions: string[] | undefined,
): IFieldMetadata => {
  const known = new Set(metadata.fields.map((field) => field.name));
  const extra = (expressions ?? [])
    .filter(
      (expression) => !known.has(expression) && expressionDims[expression],
    )
    .map((expression) => ({
      name: expression,
      dims: expressionDims[expression],
    }));
  return extra.length
    ? { ...metadata, fields: [...metadata.fields, ...extra] }
    : metadata;
};
