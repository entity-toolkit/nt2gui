import { IFieldMetadata } from "./global";

/** Trims and collapses runs of whitespace, so stray spaces don't create duplicates. */
export const normalizeExpression = (text: string) =>
  text.trim().replace(/\s+/g, " ");

export const addExpression = (
  expressions: string[] | undefined,
  expression: string,
) => {
  const list = expressions ?? [];
  return list.includes(expression) ? list : [...list, expression];
};

export const removeExpression = (
  expressions: string[] | undefined,
  expression: string,
) => (expressions ?? []).filter((e) => e !== expression);

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
