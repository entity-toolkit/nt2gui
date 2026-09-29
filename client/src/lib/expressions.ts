/** Helpers for a plot's list of custom quantity expressions. */

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
