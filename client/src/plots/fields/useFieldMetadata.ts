import { useEffect, useMemo, useState } from "react";
import { checkQuantity, fetchFieldMetadata } from "../../api/fields";
import { serverErrorMessage } from "../../api/http";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";
import { withExpressionFields } from "./metadata";

const SEPARATOR = "\u0000";

const getFieldMetadata = cachedLoader(fetchFieldMetadata);
const getQuantityDims = cachedLoader(async (key) => {
  const [simulationId, expression] = key.split(SEPARATOR);
  return (await checkQuantity(simulationId, expression)).dims;
});

/** Validates an expression; resolves to its dims or the server's reason. */
export const checkExpression = (
  simulationId: string,
  expression: string,
): Promise<{ dims: string[] } | { error: string }> =>
  getQuantityDims(`${simulationId}${SEPARATOR}${expression}`).then(
    (dims) => ({ dims }),
    (error: unknown) => ({ error: serverErrorMessage(error) }),
  );

/** Dims of each custom expression, and why the invalid ones failed. */
const useExpressionDims = (
  simulationId: string | null,
  expressions: string[],
) => {
  const key = simulationId
    ? [simulationId, ...expressions].join(SEPARATOR)
    : null;
  const [state, setState] = useState<{
    key: string | null;
    dims: Record<string, string[]>;
    errors: Record<string, string>;
  }>({ key: null, dims: {}, errors: {} });

  useEffect(() => {
    if (key === null) return;
    const [id, ...list] = key.split(SEPARATOR);
    let cancelled = false;
    Promise.all(list.map((expression) => checkExpression(id, expression))).then(
      (results) => {
        if (cancelled) return;
        const dims: Record<string, string[]> = {};
        const errors: Record<string, string> = {};
        results.forEach((result, index) => {
          if ("dims" in result) dims[list[index]] = result.dims;
          else errors[list[index]] = result.error;
        });
        setState({ key, dims, errors });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const ready = !expressions.length || state.key === key;
  return state.key === key
    ? { ...state, ready }
    : { dims: {}, errors: {}, ready };
};

/**
 * A simulation's field metadata with the plot's custom expressions added as
 * fields (null until those are checked), so the axis and slice helpers treat
 * them like any other field.
 */
export const useFieldMetadata = (
  simulationId: string | null,
  expressions: string[] | undefined,
) => {
  const list = useMemo(() => expressions ?? [], [expressions]);
  const base = useCachedResource(simulationId, getFieldMetadata);
  const checked = useExpressionDims(simulationId, list);
  const metadata = useMemo(
    () =>
      base.data && checked.ready
        ? withExpressionFields(base.data, checked.dims, list)
        : null,
    [base.data, checked.dims, checked.ready, list],
  );
  return { metadata, error: base.error, expressionErrors: checked.errors };
};
