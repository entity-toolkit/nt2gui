import { describe, expect, it } from "vitest";
import {
  addExpression,
  normalizeExpression,
  removeExpression,
} from "./expressions";

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
