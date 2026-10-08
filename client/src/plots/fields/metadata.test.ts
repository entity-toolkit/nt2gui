import { describe, expect, it } from "vitest";
import { IFieldMetadata } from "../../api/types";
import {
  expandQuantity,
  quantityDims,
  withExpressionFields,
  withSlice,
  withSmoothing,
} from "./metadata";

const metadata: IFieldMetadata = {
  fields: [
    { name: "Bx", dims: ["x", "y"] },
    { name: "By", dims: ["x", "y"] },
    { name: "Bz", dims: ["x", "y"] },
    { name: "rho", dims: ["x", "y", "z"] },
    { name: "profile", dims: ["z"] },
  ],
  vectors: [{ name: "B", components: ["Bx", "By", "Bz"] }],
  coords: { x: [0, 1, 2], y: [-1, 0, 1], z: [10, 20] },
};

describe("expandQuantity", () => {
  it("expands a vector into its components", () => {
    expect(expandQuantity(metadata, "B")).toEqual(["Bx", "By", "Bz"]);
  });

  it("keeps a single component as is", () => {
    expect(expandQuantity(metadata, "Bx")).toEqual(["Bx"]);
  });

  it("returns nothing for unknown names", () => {
    expect(expandQuantity(metadata, "nope")).toEqual([]);
  });
});

describe("quantityDims", () => {
  it("unions the dims of the selected quantities in first-seen order", () => {
    expect(quantityDims(metadata, ["profile", "B"])).toEqual(["z", "x", "y"]);
  });

  it("offers every dimension when nothing is selected", () => {
    expect(quantityDims(metadata, [])).toEqual(["x", "y", "z"]);
  });
});

describe("withSlice", () => {
  it("updates one slice and keeps identity when unchanged", () => {
    const config = { quantities: [], axis: "x", slices: { y: 0 } };
    expect(withSlice(config, "z", 3).slices).toEqual({ y: 0, z: 3 });
    expect(withSlice(config, "y", 0)).toBe(config);
  });

  it("works on configs whose slices are optional", () => {
    const pseudocolor: { field: string; slices?: Record<string, number> } = {
      field: "rho",
    };
    expect(withSlice(pseudocolor, "z", 1)).toEqual({
      field: "rho",
      slices: { z: 1 },
    });
  });
});

describe("withExpressionFields", () => {
  it("adds expressions with known dims as fields", () => {
    const augmented = withExpressionFields(
      metadata,
      { "Bx * rho": ["x", "y", "z"] },
      ["Bx * rho"],
    );
    expect(augmented.fields.at(-1)).toEqual({
      name: "Bx * rho",
      dims: ["x", "y", "z"],
    });
    // ...so dimension helpers see them like any other field.
    expect(quantityDims(augmented, ["Bx * rho"])).toEqual(["x", "y", "z"]);
  });

  it("skips expressions without dims and ones that are real fields", () => {
    expect(
      withExpressionFields(metadata, { Bx: ["x", "y"] }, ["Bx", "pending"]),
    ).toBe(metadata);
  });
});

describe("withSmoothing", () => {
  it("sets, replaces and clears per-dim windows", () => {
    const config: { field: string; smoothing?: Record<string, number> } = {
      field: "f",
    };
    const one = withSmoothing(config, "x", 0.5);
    expect(one).toEqual({ field: "f", smoothing: { x: 0.5 } });
    const two = withSmoothing(one, "y", 2);
    expect(two.smoothing).toEqual({ x: 0.5, y: 2 });
    expect(withSmoothing(two, "y", 2)).toBe(two);
    expect(withSmoothing(two, "x", undefined).smoothing).toEqual({ y: 2 });
    expect(withSmoothing(one, "x", 0)).toEqual({ field: "f" });
    expect(withSmoothing(config, "x", -1)).toBe(config);
  });
});
