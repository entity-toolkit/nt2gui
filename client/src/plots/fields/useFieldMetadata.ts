import { useEffect, useMemo, useRef, useState } from "react";
import { checkQuantity, fetchFieldMetadata, Variables } from "../../api/fields";
import { serverErrorMessage } from "../../api/http";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";
import { IFieldMetadata } from "../../api/types";
import { IVariable } from "../../state/schema";
import { metadataFrame } from "../../state/transforms";
import { useSimulationVersion } from "../../state/simulationData";
import { useUi } from "../../state/UiContext";
import { usedVariables } from "../../state/variables";
import { withExpressionFields } from "./metadata";

const SEPARATOR = "\u0000";

// Keys: the simulation id, then (with transforms) NUL and the frame as JSON.
const getFieldMetadata = cachedLoader((key) => {
  const [simulationId, frame] = key.split(SEPARATOR);
  return fetchFieldMetadata(simulationId, frame ? JSON.parse(frame) : null);
});
const getQuantityDims = cachedLoader(async (key) => {
  const [simulationId, context, expression] = key.split(SEPARATOR);
  const { variables, transforms } = JSON.parse(context);
  return (await checkQuantity(simulationId, expression, variables, transforms))
    .dims;
});

/**
 * Validates an expression (which may use the named `variables` and the
 * coordinates `transforms` add, like xp); resolves to its dims or the
 * server's reason.
 */
export const checkExpression = (
  simulationId: string,
  expression: string,
  variables: Variables = {},
  transforms: Record<string, string> = {},
): Promise<{ dims: string[] } | { error: string }> =>
  getQuantityDims(
    [simulationId, JSON.stringify({ variables, transforms }), expression].join(
      SEPARATOR,
    ),
  ).then(
    (dims) => ({ dims }),
    (error: unknown) => ({ error: serverErrorMessage(error) }),
  );

/** Dims of each custom expression, and why the invalid ones failed. */
const useExpressionDims = (
  simulationId: string | null,
  expressions: string[],
  variables: IVariable[],
  transforms: Record<string, string>,
  version: number,
) => {
  const key = simulationId
    ? [
        simulationId,
        JSON.stringify({ variables, transforms }),
        ...expressions,
      ].join(SEPARATOR)
    : null;
  const [state, setState] = useState<{
    key: string | null;
    dims: Record<string, string[]>;
    errors: Record<string, string>;
  }>({ key: null, dims: {}, errors: {} });

  useEffect(() => {
    if (key === null) return;
    const [id, json, ...list] = key.split(SEPARATOR);
    const context: {
      variables: IVariable[];
      transforms: Record<string, string>;
    } = JSON.parse(json);
    let cancelled = false;
    Promise.all(
      list.map((expression) =>
        checkExpression(
          id,
          expression,
          usedVariables([expression], context.variables),
          context.transforms,
        ),
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
  /** The plot's time: coordinates of a moving frame depend on it. */
  time?: number,
) => {
  const { uiState } = useUi();
  const variables = uiState.fieldVariables;
  const transforms = uiState.coordinateTransforms ?? NO_TRANSFORMS;
  const frame = metadataFrame(transforms, time, uiState.timeAxis);
  const key =
    simulationId && frame
      ? `${simulationId}${SEPARATOR}${JSON.stringify(frame)}`
      : simulationId;
  const list = useMemo(
    () => [...(variables ?? []).map((v) => v.name), ...(expressions ?? [])],
    [expressions, variables],
  );
  const version = useSimulationVersion(simulationId);
  const loaded = useCachedResource(key, getFieldMetadata, version);
  // While a new frame (e.g. the next time of a moving frame) loads, keep
  // showing the simulation's previous metadata rather than nothing.
  const last = useRef<{ simulationId: string | null; data: IFieldMetadata }>(
    null,
  );
  if (loaded.data) last.current = { simulationId, data: loaded.data };
  const base =
    !loaded.data && !loaded.error && last.current?.simulationId === simulationId
      ? { data: last.current.data, error: null }
      : loaded;
  const checked = useExpressionDims(
    simulationId,
    list,
    variables ?? NO_VARIABLES,
    transforms,
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
const NO_TRANSFORMS: Record<string, string> = {};
