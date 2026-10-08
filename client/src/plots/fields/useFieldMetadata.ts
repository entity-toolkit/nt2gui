import { useEffect, useMemo, useState } from "react";
import { checkQuantity, fetchFieldMetadata, Variables } from "../../api/fields";
import { serverErrorMessage } from "../../api/http";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";
import { IVariable } from "../../state/schema";
import { useSimulationVersion } from "../../state/simulationData";
import { useUi } from "../../state/UiContext";
import { usedVariables } from "../../state/variables";
import { withExpressionFields } from "./metadata";

const SEPARATOR = "\u0000";

const getFieldMetadata = cachedLoader(fetchFieldMetadata);
const getQuantityDims = cachedLoader(async (key) => {
  const [simulationId, variables, expression] = key.split(SEPARATOR);
  return (await checkQuantity(simulationId, expression, JSON.parse(variables)))
    .dims;
});

/**
 * Validates an expression (which may use the named `variables`); resolves to
 * its dims or the server's reason.
 */
export const checkExpression = (
  simulationId: string,
  expression: string,
  variables: Variables = {},
): Promise<{ dims: string[] } | { error: string }> =>
  getQuantityDims(
    [simulationId, JSON.stringify(variables), expression].join(SEPARATOR),
  ).then(
    (dims) => ({ dims }),
    (error: unknown) => ({ error: serverErrorMessage(error) }),
  );

/** Dims of each custom expression, and why the invalid ones failed. */
const useExpressionDims = (
  simulationId: string | null,
  expressions: string[],
  variables: IVariable[],
  version: number,
) => {
  const key = simulationId
    ? [simulationId, JSON.stringify(variables), ...expressions].join(SEPARATOR)
    : null;
  const [state, setState] = useState<{
    key: string | null;
    dims: Record<string, string[]>;
    errors: Record<string, string>;
  }>({ key: null, dims: {}, errors: {} });

  useEffect(() => {
    if (key === null) return;
    const [id, json, ...list] = key.split(SEPARATOR);
    const all: IVariable[] = JSON.parse(json);
    let cancelled = false;
    Promise.all(
      list.map((expression) =>
        checkExpression(id, expression, usedVariables([expression], all)),
      ),
    ).then((results) => {
      if (cancelled) return;
      const dims: Record<string, string[]> = {};
      const errors: Record<string, string> = {};
      results.forEach((result, index) => {
        if ("dims" in result) dims[list[index]] = result.dims;
        else errors[list[index]] = result.error;
      });
      setState({ key, dims, errors });
    });
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const ready = !expressions.length || state.key === key;
  return state.key === key
    ? { ...state, ready }
    : { dims: {}, errors: {}, ready };
};

/**
 * A simulation's field metadata with the session's named variables and the
 * plot's custom expressions added as fields (null until those are checked),
 * so the axis and slice helpers treat them like any other field.
 */
export const useFieldMetadata = (
  simulationId: string | null,
  expressions: string[] | undefined,
) => {
  const { uiState } = useUi();
  const variables = uiState.fieldVariables;
  const list = useMemo(
    () => [...(variables ?? []).map((v) => v.name), ...(expressions ?? [])],
    [expressions, variables],
  );
  const version = useSimulationVersion(simulationId);
  const base = useCachedResource(simulationId, getFieldMetadata, version);
  const checked = useExpressionDims(
    simulationId,
    list,
    variables ?? NO_VARIABLES,
    version,
  );
  const metadata = useMemo(
    () =>
      base.data && checked.ready
        ? withExpressionFields(base.data, checked.dims, list)
        : null,
    [base.data, checked.dims, checked.ready, list],
  );
  return {
    metadata,
    error: base.error,
    expressionErrors: checked.errors,
    variables: variables ?? NO_VARIABLES,
  };
};

const NO_VARIABLES: IVariable[] = [];
