import { describe, expect, it } from "vitest";
import { IParticleMetadata } from "../../api/types";
import {
  defaultScaleFor,
  histogramRequest,
  histogramToLines,
  isSpeciesSelected,
  phaseRequest,
  seriesPerSpecies,
  speciesLabel,
  toggleSpecies,
  uniqueLabels,
  withAxisQuantity,
  withAxisScale,
  withoutRange,
  withZoomWindow,
  withPanWindow,
  hasRange,
} from "./config";

const metadata: IParticleMetadata = {
  species: [
    { index: 1, label: "e-", mass: 1 },
    { index: 2, label: "e+", mass: 1 },
    { index: 3, label: "photons", mass: 0 },
  ],
  quantities: [
    { name: "x", defaultScale: "linear" },
    { name: "gamma", defaultScale: "log" },
    { name: "energy", defaultScale: "log" },
  ],
};
const all = [1, 2, 3];

describe("species selection", () => {
  it("treats [] as all species", () => {
    expect(isSpeciesSelected([], 2)).toBe(true);
    expect(isSpeciesSelected([1], 2)).toBe(false);
  });

  it("deselecting from 'all' keeps the others", () => {
    expect(toggleSpecies([], 2, all)).toEqual([1, 3]);
  });

  it("selecting every species collapses back to all", () => {
    expect(toggleSpecies([1, 3], 2, all)).toEqual([]);
  });

  it("keeps species in simulation order", () => {
    expect(toggleSpecies([3], 1, all)).toEqual([1, 3]);
  });

  it("deselecting the last species means all again", () => {
    expect(toggleSpecies([2], 2, all)).toEqual([]);
  });

  it("labels selections", () => {
    expect(speciesLabel([], metadata)).toBe("all species");
    expect(speciesLabel([1, 2], metadata)).toBe("e- + e+");
    expect(speciesLabel([9], metadata)).toBe("sp 9");
  });

  it("builds one series per species", () => {
    expect(seriesPerSpecies(metadata)).toEqual([
      { species: [1] },
      { species: [2] },
      { species: [3] },
    ]);
  });
});

describe("axis helpers", () => {
  it("defaults gamma/energy to log and others to linear", () => {
    expect(defaultScaleFor("energy", metadata)).toBe("log");
    expect(defaultScaleFor("x", metadata)).toBe("linear");
    expect(defaultScaleFor("gamma - 1", metadata)).toBe("linear");
  });

  it("switching quantity resets scale and range but keeps bins/power", () => {
    const axis = {
      quantity: "x",
      scale: "power" as const,
      power: 0.3,
      bins: 50,
      min: 0,
      max: 5,
    };
    expect(withAxisQuantity(axis, "energy", metadata)).toEqual({
      quantity: "energy",
      scale: "log",
      power: 0.3,
      bins: 50,
    });
    expect(withAxisQuantity(axis, "x", metadata)).toBe(axis);
  });

  it("switching scale drops the range", () => {
    const axis = { quantity: "ux", scale: "linear" as const, min: -1, max: 1 };
    expect(withAxisScale(axis, "power")).toEqual({
      quantity: "ux",
      scale: "power",
    });
  });
});

describe("requests", () => {
  it("leaves display-only settings out of histogram requests", () => {
    const config = {
      x: { quantity: "gamma", scale: "log" as const },
      series: [{ species: [] }],
      yScale: "linear" as const,
      yMin: 1,
      expressions: ["gamma - 1"],
    };
    expect(histogramRequest(config)).toEqual({
      config: { x: config.x, series: config.series },
      regions: [],
      variables: {},
      transforms: {},
    });
  });

  it("sends the saved regions lines use, dropping deleted ones", () => {
    const region = { name: "region-01", ranges: { x: { min: 0, max: 1 } } };
    const config = {
      x: { quantity: "gamma", scale: "log" as const },
      series: [
        { species: [], regions: ["region-01", "gone"] },
        { species: [1] },
      ],
    };
    expect(histogramRequest(config, [region])).toEqual({
      config: {
        x: config.x,
        series: [{ species: [], regions: ["region-01"] }, { species: [1] }],
      },
      regions: [region],
      variables: {},
      transforms: {},
    });
    const phase = {
      x: { quantity: "x", scale: "linear" as const },
      y: { quantity: "ux", scale: "linear" as const },
      regions: ["gone", "region-01"],
    };
    expect(phaseRequest(phase, [region])).toEqual({
      config: { ...phase, regions: ["region-01"] },
      regions: [region],
      variables: {},
      transforms: {},
    });
  });

  it("keeps color settings in phase requests (the server draws them)", () => {
    const config = {
      x: { quantity: "x", scale: "linear" as const },
      y: { quantity: "ux", scale: "linear" as const },
      colorScale: "linear" as const,
      expressions: ["ux * w"],
    };
    expect(phaseRequest(config)).toEqual({
      config: { x: config.x, y: config.y, colorScale: "linear" },
      regions: [],
      variables: {},
      transforms: {},
    });
  });

  it("sends the named variables the axes use, and only those", () => {
    const variables = [
      { name: "uperp", expression: "sqrt(uy**2 + uz**2)" },
      { name: "ratio", expression: "uperp / gamma" },
      { name: "other", expression: "w" },
    ];
    const config = {
      x: { quantity: "ratio", scale: "linear" as const },
      series: [{ species: [] }],
    };
    expect(histogramRequest(config, [], variables).variables).toEqual({
      ratio: "uperp / gamma",
      uperp: "sqrt(uy**2 + uz**2)",
    });
  });
});

describe("histogramToLines", () => {
  it("turns bins into step lines over the edges", () => {
    const lines = histogramToLines(
      {
        edges: [1, 10, 100],
        series: [
          { species: [1], counts: [5, 2], excludedWeight: 0 },
          { species: [], counts: [0, 7], excludedWeight: 0 },
        ],
        timestamp: 0.5,
      },
      ["e-", "all species"],
      "gamma",
    );
    expect(lines.coordinates).toEqual([1, 10, 100]);
    expect(lines.series).toEqual([
      { name: "e-", values: [5, 2, 2] },
      { name: "all species", values: [0, 7, 7] },
    ]);
    expect(lines.axis).toBe("gamma");
  });

  it("makes repeated labels unique", () => {
    expect(uniqueLabels(["e-", "e+", "e-"])).toEqual(["e-", "e+", "e- (2)"]);
  });
});

describe("ranges", () => {
  it("clears a binned range and reports whether one is set", () => {
    const axis = { quantity: "x", scale: "linear" as const, bins: 10, min: 1 };
    expect(hasRange(axis)).toBe(true);
    expect(withoutRange(axis)).toEqual({
      quantity: "x",
      scale: "linear",
      bins: 10,
    });
    const auto = { quantity: "x", scale: "linear" as const };
    expect(hasRange(auto)).toBe(false);
    expect(withoutRange(auto)).toBe(auto);
  });
});

describe("withZoomWindow", () => {
  it("sets both binned ranges, keeping scales and bins", () => {
    const config = {
      x: { quantity: "x", scale: "linear" as const, bins: 64 },
      y: {
        quantity: "ux",
        scale: "power" as const,
        power: 0.3,
        min: -9,
        max: 9,
      },
      species: [1],
    };
    expect(
      withZoomWindow(config, { xMin: 1, xMax: 2, yMin: -3, yMax: 4 }),
    ).toEqual({
      x: { quantity: "x", scale: "linear", bins: 64, min: 1, max: 2 },
      y: { quantity: "ux", scale: "power", power: 0.3, min: -3, max: 4 },
      species: [1],
    });
  });
});

describe("withPanWindow", () => {
  it("moves only the axes that have a range", () => {
    const config = {
      x: { quantity: "x", scale: "linear" as const, min: 0, max: 1 },
      y: { quantity: "ux", scale: "linear" as const },
    };
    const next = withPanWindow(config, { xMin: 2, xMax: 3, yMin: -5, yMax: 5 });
    expect(next.x).toEqual({ quantity: "x", scale: "linear", min: 2, max: 3 });
    expect(next.y).toBe(config.y);
  });
});
