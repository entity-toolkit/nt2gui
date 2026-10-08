import { describe, expect, it } from "vitest";
import { DataType, IUiState, PlotType } from "./schema";
import {
  parseDefinition,
  renameInExpression,
  usedVariables,
  variableNameProblem,
  variablesOf,
  withNamedExpression,
  withRenamedVariable,
  withVariable,
  withoutVariable,
} from "./variables";

const state = (): IUiState => ({
  layout: { global: {}, layout: { type: "row", children: [] } },
  plotters: {
    line: {
      plotType: PlotType.Line,
      dataType: DataType.Fields,
      lineConfig: {
        quantities: ["edotb", "Ex*Bx + Ey*By", "2*edotb"],
        axis: "x",
        slices: {},
        expressions: ["Ex*Bx + Ey*By", "2*edotb"],
      },
    },
    image: {
      plotType: PlotType.Pseudocolor,
      dataType: DataType.Fields,
      pseudocolorConfig: {
        field: "Ex*Bx + Ey*By",
        xCoordinate: "x",
        yCoordinate: "y",
        colorMap: "viridis",
        expressions: ["Ex*Bx + Ey*By"],
      },
    },
    phase: {
      plotType: PlotType.Pseudocolor,
      dataType: DataType.Particles,
      particlePhaseConfig: {
        x: { quantity: "edotb", scale: "linear" },
        y: { quantity: "ux", scale: "linear" },
      },
    },
  },
  timeline: { current: 0, min: 0, max: 1, step: 1 },
  globalViewport: null,
  globalLineViewports: {},
  fieldVariables: [
    { name: "edotb", expression: "Ex*Bx + Ey*By" },
    { name: "epar", expression: "edotb / sqrt(Bx**2 + By**2)" },
  ],
});

describe("parseDefinition", () => {
  it("reads `name = expression`, not comparisons", () => {
    expect(parseDefinition(" epar =  edotb /  b ")).toEqual({
      name: "epar",
      expression: "edotb / b",
    });
    expect(parseDefinition("Ex == 0")).toBeNull();
    expect(parseDefinition("Ex <= 0")).toBeNull();
    expect(parseDefinition("sqrt(Ex**2)")).toBeNull();
    expect(parseDefinition("a = ")).toBeNull();
  });
});

describe("variableNameProblem", () => {
  const variables = state().fieldVariables!;
  it("needs a free identifier", () => {
    expect(variableNameProblem("", variables)).toMatch(/required/);
    expect(variableNameProblem("2a", variables)).toMatch(/letters/);
    expect(variableNameProblem("epar", variables)).toMatch(/already called/);
    expect(variableNameProblem("epar", variables, [], "epar")).toBeNull();
    expect(variableNameProblem("Ex", variables, ["Ex"])).toMatch(
      /already a quantity/,
    );
    expect(variableNameProblem("x".repeat(65), variables)).toMatch(/at most/);
    expect(variableNameProblem("bmag", variables)).toBeNull();
  });
});

describe("usedVariables", () => {
  it("follows variables through each other", () => {
    const variables = state().fieldVariables!;
    expect(usedVariables(["2*epar"], variables)).toEqual({
      epar: "edotb / sqrt(Bx**2 + By**2)",
      edotb: "Ex*Bx + Ey*By",
    });
    expect(usedVariables(["Ex", undefined], variables)).toEqual({});
  });
});

describe("renaming", () => {
  it("replaces whole identifiers only", () => {
    expect(renameInExpression("e + e2 + np.e + f(e)", "e", "q")).toBe(
      "q + e2 + np.e + f(q)",
    );
  });

  it("renames the variable and every use of it", () => {
    const next = withRenamedVariable(state(), "fields", "edotb", "eb");
    expect(variablesOf(next, "fields")).toEqual([
      { name: "eb", expression: "Ex*Bx + Ey*By" },
      { name: "epar", expression: "eb / sqrt(Bx**2 + By**2)" },
    ]);
    expect(next.plotters.line.lineConfig?.quantities).toEqual([
      "eb",
      "Ex*Bx + Ey*By",
      "2*eb",
    ]);
    expect(next.plotters.line.lineConfig?.expressions).toEqual([
      "Ex*Bx + Ey*By",
      "2*eb",
    ]);
    // Particle plots have their own variables.
    expect(next.plotters.phase.particlePhaseConfig?.x.quantity).toBe("edotb");
  });
});

describe("naming an expression", () => {
  it("turns it into a variable wherever plots use it", () => {
    const next = withNamedExpression(
      { ...state(), fieldVariables: [] },
      "fields",
      "Ex*Bx + Ey*By",
      "eb",
    );
    expect(variablesOf(next, "fields")).toEqual([
      { name: "eb", expression: "Ex*Bx + Ey*By" },
    ]);
    expect(next.plotters.line.lineConfig?.quantities).toEqual([
      "edotb",
      "eb",
      "2*edotb",
    ]);
    expect(next.plotters.line.lineConfig?.expressions).toEqual(["2*edotb"]);
    expect(next.plotters.image.pseudocolorConfig?.field).toBe("eb");
    expect(next.plotters.image.pseudocolorConfig?.expressions).toEqual([]);
  });

  it("defines, redefines and removes", () => {
    let next = withVariable(state(), "particles", {
      name: "uperp",
      expression: "sqrt(uy**2)",
    });
    next = withVariable(next, "particles", {
      name: "uperp",
      expression: "sqrt(uy**2 + uz**2)",
    });
    expect(variablesOf(next, "particles")).toEqual([
      { name: "uperp", expression: "sqrt(uy**2 + uz**2)" },
    ]);
    expect(
      variablesOf(withoutVariable(next, "fields", "edotb"), "fields"),
    ).toHaveLength(1);
  });
});
