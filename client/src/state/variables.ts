/**
 * Named custom quantities ("variables", e.g. `edotb = Ex*Bx + Ey*By`), shared
 * by every plot of their kind and usable inside other variables. Pure
 * functions: parsing definitions, finding what an expression uses, and
 * keeping every reference right when a variable is named or renamed.
 */
import { IPlotter, IUiState, IVariable, VariableKind } from "./schema";

// Matches `Variable.name` in nt2gui/session/schema.py.
export const MAX_VARIABLE_NAME = 64;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// `name = expression`, but not a comparison (`a == b`, `a <= b`).
const DEFINITION = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*([\s\S]+)$/;
const NAME_TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

const KEY: Record<VariableKind, "fieldVariables" | "particleVariables"> = {
  fields: "fieldVariables",
  particles: "particleVariables",
};

export const variablesOf = (state: IUiState, kind: VariableKind): IVariable[] =>
  state[KEY[kind]] ?? [];

/** `name = expression` as a definition; null for a plain expression. */
export const parseDefinition = (text: string): IVariable | null => {
  const match = DEFINITION.exec(text);
  if (!match) return null;
  const expression = match[2].trim().replace(/\s+/g, " ");
  return expression ? { name: match[1], expression } : null;
};

/**
 * Why `name` can't (re)name a variable, or null. `taken` are other names in
 * the way (fields, coordinates, …); `current` is the variable being renamed.
 * Built-in names (sqrt, pi, …) are refused by the server's check.
 */
export const variableNameProblem = (
  name: string,
  variables: IVariable[],
  taken: string[] = [],
  current?: string,
): string | null => {
  if (!name) return "A name is required";
  if (!IDENTIFIER.test(name)) {
    return "Names use letters, digits and _, and don't start with a digit";
  }
  if (name.length > MAX_VARIABLE_NAME) {
    return `Names are at most ${MAX_VARIABLE_NAME} characters`;
  }
  if (name !== current && variables.some((v) => v.name === name)) {
    return `A variable is already called '${name}'`;
  }
  if (taken.includes(name)) return `'${name}' is already a quantity`;
  return null;
};

/** The identifiers in an expression (function names included). */
const namesIn = (text: string) => new Set(text.match(NAME_TOKEN) ?? []);

/**
 * The variables `texts` use, directly or through other variables, as the
 * `{name: expression}` a request sends (only these, so editing an unrelated
 * variable doesn't re-render a plot).
 */
export const usedVariables = (
  texts: (string | undefined)[],
  variables: IVariable[],
): Record<string, string> => {
  const byName = new Map(variables.map((v) => [v.name, v.expression]));
  const used: Record<string, string> = {};
  const visit = (text: string) => {
    for (const name of namesIn(text)) {
      const expression = byName.get(name);
      if (expression !== undefined && !(name in used)) {
        used[name] = expression;
        visit(expression);
      }
    }
  };
  texts.forEach((text) => text && visit(text));
  return used;
};

/** `text` with the identifier `from` (not an attribute like np.from) replaced. */
export const renameInExpression = (text: string, from: string, to: string) =>
  text.replace(
    new RegExp(`(?<![A-Za-z0-9_.])${from}(?![A-Za-z0-9_])`, "g"),
    to,
  );

/** Applies `update` to every quantity text plots of `kind` hold. */
const mapPlotQuantities = (
  plotters: IUiState["plotters"],
  kind: VariableKind,
  update: (text: string) => string,
  updateList: (texts: string[] | undefined) => string[] | undefined,
): IUiState["plotters"] =>
  Object.fromEntries(
    Object.entries(plotters).map(([id, plotter]): [string, IPlotter] => {
      const next = { ...plotter };
      if (kind === "fields") {
        const line = plotter.lineConfig;
        const image = plotter.pseudocolorConfig;
        if (line) {
          next.lineConfig = {
            ...line,
            quantities: line.quantities.map(update),
            expressions: updateList(line.expressions),
          };
        }
        if (image) {
          next.pseudocolorConfig = {
            ...image,
            field: update(image.field),
            expressions: updateList(image.expressions),
          };
        }
      } else {
        const histogram = plotter.particleHistogramConfig;
        const phase = plotter.particlePhaseConfig;
        if (histogram) {
          next.particleHistogramConfig = {
            ...histogram,
            x: { ...histogram.x, quantity: update(histogram.x.quantity) },
            expressions: updateList(histogram.expressions),
          };
        }
        if (phase) {
          next.particlePhaseConfig = {
            ...phase,
            x: { ...phase.x, quantity: update(phase.x.quantity) },
            y: { ...phase.y, quantity: update(phase.y.quantity) },
            expressions: updateList(phase.expressions),
          };
        }
      }
      return [id, next];
    }),
  );

const dedupe = (texts: string[]) => [...new Set(texts)];

/** Defines a variable, or redefines the one with its name. */
export const withVariable = (
  state: IUiState,
  kind: VariableKind,
  variable: IVariable,
): IUiState => {
  const variables = variablesOf(state, kind);
  const index = variables.findIndex((v) => v.name === variable.name);
  return {
    ...state,
    [KEY[kind]]:
      index < 0
        ? [...variables, variable]
        : variables.map((v, i) => (i === index ? variable : v)),
  };
};

/** Removes a variable; plots and variables still using it will say so. */
export const withoutVariable = (
  state: IUiState,
  kind: VariableKind,
  name: string,
): IUiState => ({
  ...state,
  [KEY[kind]]: variablesOf(state, kind).filter((v) => v.name !== name),
});

/**
 * Renames a variable and every use of it: in other variables, and in the
 * quantities and custom expressions of every plot of its kind.
 */
export const withRenamedVariable = (
  state: IUiState,
  kind: VariableKind,
  from: string,
  to: string,
): IUiState => {
  if (from === to) return state;
  const rename = (text: string) => renameInExpression(text, from, to);
  return {
    ...state,
    plotters: mapPlotQuantities(
      state.plotters,
      kind,
      rename,
      (texts) => texts && dedupe(texts.map(rename)),
    ),
    [KEY[kind]]: variablesOf(state, kind).map((v) => ({
      name: v.name === from ? to : v.name,
      expression: rename(v.expression),
    })),
  };
};

/**
 * Gives a plot's custom expression a name: it becomes a variable, and every
 * plot of its kind showing that exact expression shows the variable instead
 * (no longer listing it as its own custom expression).
 */
export const withNamedExpression = (
  state: IUiState,
  kind: VariableKind,
  expression: string,
  name: string,
): IUiState => {
  const named = withVariable(state, kind, { name, expression });
  return {
    ...named,
    plotters: mapPlotQuantities(
      named.plotters,
      kind,
      (text) => (text === expression ? name : text),
      (texts) => texts?.filter((text) => text !== expression),
    ),
  };
};
