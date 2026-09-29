import { useEffect, useState } from "react";
import { checkQuantity } from "../services/fieldService";
import { serverErrorMessage } from "../services/sessionService";

type Checked = { dims: string[] } | { error: string };

// Whether an expression is valid (and its dims) can't change while a
// simulation is loaded, so each (simulation, expression) is checked once.
const cache = new Map<string, Promise<Checked>>();

/** Validates an expression against a simulation; never rejects. */
export const checkExpression = (
  simulationId: string,
  expression: string,
): Promise<Checked> => {
  const key = `${simulationId}\u0000${expression}`;
  let request = cache.get(key);
  if (!request) {
    request = checkQuantity(simulationId, expression).then(
      (result) => ({ dims: result.dims }),
      (error: unknown) => {
        // Only cache verdicts from the server, not network failures.
        cache.delete(key);
        return { error: serverErrorMessage(error) };
      },
    );
    cache.set(key, request);
  }
  return request;
};

/**
 * Dims of each custom expression (for axis choices and slice sliders), and
 * why the invalid ones failed. `ready` turns true once every one is checked.
 */
export const useExpressionDims = (
  simulationId: string | null,
  expressions: string[] | undefined,
) => {
  const key = JSON.stringify([simulationId, expressions ?? []]);
  const [state, setState] = useState<{
    key: string;
    dims: Record<string, string[]>;
    errors: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    const [id, list] = JSON.parse(key) as [string | null, string[]];
    if (!id) return;
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

  const ready = !expressions?.length || state?.key === key;
  return {
    ready,
    dims: state?.key === key ? state.dims : {},
    errors: state?.key === key ? state.errors : {},
  };
};
