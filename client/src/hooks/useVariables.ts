import { checkExpression } from "../plots/fields/useFieldMetadata";
import { checkParticleExpression } from "../plots/particles/useParticleMetadata";
import { IVariable, VariableKind } from "../state/schema";
import { useUi, useUiActions } from "../state/UiContext";
import {
  usedVariables,
  variableNameProblem,
  variablesOf,
  withNamedExpression,
  withRenamedVariable,
  withVariable,
  withoutVariable,
} from "../state/variables";

/**
 * The session's named variables of one kind, and changes to them. Every
 * change is checked first (the name locally, the definitions by the server
 * against `simulationId`); each resolves to why it was refused, or null.
 * `taken` are names variables can't have (the data's own quantities).
 */
export const useVariables = (
  kind: VariableKind,
  simulationId: string,
  taken: string[],
) => {
  const { uiState } = useUi();
  const { updateUiState } = useUiActions();
  const variables = variablesOf(uiState, kind);
  const transforms = uiState.coordinateTransforms ?? {};

  /** Whether `name` evaluates with the definitions `next`. */
  const check = async (name: string, next: IVariable[]) => {
    const used = usedVariables([name], next);
    if (kind === "fields") {
      const result = await checkExpression(
        simulationId,
        name,
        used,
        transforms,
      );
      return "error" in result ? result.error : null;
    }
    return checkParticleExpression(simulationId, name, used, transforms);
  };

  return {
    variables,
    /** Defines `name = expression`, or redefines an existing `name`. */
    define: async (name: string, expression: string) => {
      const problem = variableNameProblem(name, variables, taken, name);
      if (problem) return problem;
      const next = [
        ...variables.filter((v) => v.name !== name),
        { name, expression },
      ];
      const error = await check(name, next);
      if (error) return error;
      updateUiState((prev) => withVariable(prev, kind, { name, expression }));
      return null;
    },
    rename: async (from: string, to: string) => {
      if (from === to) return null;
      const problem = variableNameProblem(to, variables, taken, from);
      if (problem) return problem;
      const error = await check(
        to,
        variables.map((v) => (v.name === from ? { ...v, name: to } : v)),
      );
      if (error) return error;
      updateUiState((prev) => withRenamedVariable(prev, kind, from, to));
      return null;
    },
    remove: (name: string) =>
      updateUiState((prev) => withoutVariable(prev, kind, name)),
    /** Turns a plot's custom expression into the variable `name`. */
    nameExpression: async (expression: string, name: string) => {
      const problem = variableNameProblem(name, variables, taken);
      if (problem) return problem;
      const error = await check(name, [...variables, { name, expression }]);
      if (error) return error;
      updateUiState((prev) =>
        withNamedExpression(prev, kind, expression, name),
      );
      return null;
    },
  };
};
