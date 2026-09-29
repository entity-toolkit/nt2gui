import { describe, expect, it } from "vitest";
import {
  addExpression,
  normalizeExpression,
  removeExpression,
  withExpressionFields,
} from "./expressions";
import { IFieldMetadata } from "./global";
import { quantityDims } from "./lineConfig";

const metadata: IFieldMetadata = {
  fields: [
    { name: "f", dims: ["x", "y"] },
    { name: "rho", dims: ["x", "y", "z"] },
  ],
  vectors: [],
  coords: {},
};

describe("normalizeExpression", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeExpression("  sqrt(Ex**2 +   Ey**2)\n")).toBe(
      "sqrt(Ex**2 + Ey**2)",
    );
  });
});

describe("addExpression / removeExpression", () => {
  it("adds once and removes", () => {
    expect(addExpression(undefined, "f + g")).toEqual(["f + g"]);
    const list = ["f + g"];
    expect(addExpression(list, "f + g")).toBe(list);
    expect(removeExpression(["a", "b"], "a")).toEqual(["b"]);
    expect(removeExpression(undefined, "a")).toEqual([]);
  });
});

describe("withExpressionFields", () => {
  it("adds expressions with known dims as fields", () => {
    const augmented = withExpressionFields(
      metadata,
      { "f * rho": ["x", "y", "z"] },
      ["f * rho"],
    );
    expect(augmented.fields.at(-1)).toEqual({
      name: "f * rho",
      dims: ["x", "y", "z"],
    });
    // ...so dimension helpers see them like any other field.
    expect(quantityDims(augmented, ["f * rho"])).toEqual(["x", "y", "z"]);
  });

  it("skips expressions without dims and ones that are real fields", () => {
    expect(
      withExpressionFields(metadata, { f: ["x", "y"] }, ["f", "pending"]),
    ).toBe(metadata);
  });
});
