import { describe, expect, it } from "vitest";
import {
  countAttributes,
  filterAttributes,
  formatAttribute,
  groupAttributes,
} from "./attributes";

const attrs = {
  Dimension: 2,
  Coordinates: "cart",
  "grid.resolution": [32, 64],
  "grid.metric.metric": "minkowski",
  "grid.metric.coord": "cart",
  "algorithms.timestep.CFL": 0.5,
  "algorithms.timestep.dt": 0.35355338,
  "algorithms.deposit.enable": true,
};

describe("groupAttributes", () => {
  it("nests dotted keys into blocks, top-level ones first as general", () => {
    const blocks = groupAttributes(attrs);
    expect(blocks.map((b) => b.name)).toEqual([
      "general",
      "algorithms",
      "grid",
    ]);
    expect(blocks[0].entries.map((e) => e.name)).toEqual([
      "Coordinates",
      "Dimension",
    ]);
    const grid = blocks[2];
    expect(grid.entries).toEqual([
      { name: "resolution", key: "grid.resolution", value: [32, 64] },
    ]);
    expect(grid.blocks[0]).toMatchObject({
      name: "metric",
      path: "grid.metric",
    });
    expect(grid.blocks[0].entries.map((e) => e.key)).toEqual([
      "grid.metric.coord",
      "grid.metric.metric",
    ]);
    expect(blocks[1].blocks.map((b) => b.name)).toEqual([
      "deposit",
      "timestep",
    ]);
    expect(countAttributes(grid)).toBe(3);
  });

  it("has no general block without top-level attributes", () => {
    expect(groupAttributes({ "a.b": 1 }).map((b) => b.name)).toEqual(["a"]);
    expect(groupAttributes({})).toEqual([]);
  });
});

describe("formatAttribute", () => {
  it("formats numbers, lists, flags and empty text", () => {
    expect(formatAttribute(0.35355338)).toBe("0.353553");
    expect(formatAttribute(1000000)).toBe("1000000");
    expect(formatAttribute(1e-9)).toBe("1e-9");
    expect(formatAttribute([0, 32.5, "periodic"])).toBe("[0, 32.5, periodic]");
    expect(formatAttribute(true)).toBe("true");
    expect(formatAttribute("")).toBe("–");
  });
});

describe("filterAttributes", () => {
  it("matches keys and values, ignoring case", () => {
    expect(Object.keys(filterAttributes(attrs, "METRIC"))).toEqual([
      "grid.metric.metric",
      "grid.metric.coord",
    ]);
    expect(Object.keys(filterAttributes(attrs, "cart"))).toEqual([
      "Coordinates",
      "grid.metric.coord",
    ]);
    expect(filterAttributes(attrs, "  ")).toBe(attrs);
  });
});
