/**
 * Named custom quantities ("variables", e.g. `edotb = Ex*Bx + Ey*By`), shared
 * by every plot of their kind and usable inside other variables. Pure
 * functions: parsing definitions, finding what an expression uses, and
 * keeping every reference right when a variable is named or renamed.
 */
import {
  IParticleAxis,
  IPlotter,
  IUiState,
  IVariable,
  VariableKind,
} from "./schema";

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

// What a particle axis shows instead of a removed variable (as when a
// plot's own custom quantity is removed; see plots/particles/controls.tsx).
const AXIS_FALLBACK = { histogram: "gamma", phaseX: "x", phaseY: "ux" };

/** The axis showing `fallback` (default scale, automatic range) instead of `name`. */
const replacedAxis = (
  axis: IParticleAxis,
  name: string,
  fallback: string,
): IParticleAxis => {
  if (axis.quantity !== name) return axis;
  const { min: _min, max: _max, ...rest } = axis;
  return {
    ...rest,
    quantity: fallback,
    // As the server's default scales: log for gamma/energy.
    scale: fallback === "gamma" || fallback === "energy" ? "log" : "linear",
  };
};

/**
 * Removes a variable and takes it off every plot of its kind showing it: 1D
 * plots drop it from their quantities, 2D plots show nothing, particle axes
 * go back to a built-in quantity. Expressions and variables that merely use
 * it are kept (they will say it's unknown).
 */
export const withoutVariable = (
  state: IUiState,
  kind: VariableKind,
  name: string,
): IUiState => ({
  ...state,
  [KEY[kind]]: variablesOf(state, kind).filter((v) => v.name !== name),
  plotters: Object.fromEntries(
    Object.entries(state.plotters).map(([id, plotter]): [string, IPlotter] => {
      // Plots not showing it stay the same objects.
      const next = { ...plotter };
      const line = plotter.lineConfig;
      const image = plotter.pseudocolorConfig;
      const histogram = plotter.particleHistogramConfig;
      const phase = plotter.particlePhaseConfig;
      if (kind === "fields") {
        if (line?.quantities.includes(name)) {
          next.lineConfig = {
            ...line,
            quantities: line.quantities.filter((q) => q !== name),
          };
        }
        if (image?.field === name) {
          next.pseudocolorConfig = { ...image, field: "" };
        }
      } else {
        if (histogram?.x.quantity === name) {
          next.particleHistogramConfig = {
            ...histogram,
            x: replacedAxis(histogram.x, name, AXIS_FALLBACK.histogram),
          };
        }
        if (phase && [phase.x.quantity, phase.y.quantity].includes(name)) {
          next.particlePhaseConfig = {
            ...phase,
            x: replacedAxis(phase.x, name, AXIS_FALLBACK.phaseX),
            y: replacedAxis(phase.y, name, AXIS_FALLBACK.phaseY),
          };
        }
      }
      const changed = (Object.keys(next) as (keyof IPlotter)[]).some(
        (key) => next[key] !== plotter[key],
      );
      return [id, changed ? next : plotter];
    }),
  ),
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
