import { describe, expect, it } from "vitest";
import {
  describeRegion,
  existingRegionNames,
  nextRegionName,
  pickRegions,
  polygonArea,
  REGION_COLORS,
  regionColor,
  regionOnAxes,
  regionsOnAxes,
  regionsShown,
  selectionToRegion,
  simplifyPath,
  withoutRegion,
  withRegion,
} from "./regions";
import { DataType, IRegion, IUiState, PlotType } from "./schema";

const band: IRegion = { name: "region-01", ranges: { x: { min: 0, max: 1 } } };
const lasso: IRegion = {
  name: "region-02",
  polygon: {
    x: "x",
    y: "y",
    points: [
      [0, 0],
      [2, 0],
      [0, 4],
    ],
  },
};

const state = (regions: IRegion[]): IUiState => ({
  layout: { global: {}, layout: { type: "row", children: [] } },
  plotters: {
    phase: {
      plotType: PlotType.Pseudocolor,
      dataType: DataType.Particles,
      particlePhaseConfig: {
        x: { quantity: "x", scale: "linear" },
        y: { quantity: "ux", scale: "linear" },
        regions: ["region-01", "region-02"],
      },
    },
    spectrum: {
      plotType: PlotType.Line,
      dataType: DataType.Particles,
      particleHistogramConfig: {
        x: { quantity: "gamma", scale: "log" },
        series: [{ species: [], regions: ["region-01"] }, { species: [1] }],
      },
    },
  },
  timeline: { current: 0, min: 0, max: 1, step: 1 },
  globalViewport: null,
  globalLineViewports: {},
  regions,
});

describe("nextRegionName", () => {
  it("numbers regions one past the highest in use", () => {
    expect(nextRegionName([])).toBe("region-01");
    expect(nextRegionName([band, lasso])).toBe("region-03");
    // A deleted region's number isn't reused while a higher one exists.
    expect(nextRegionName([lasso])).toBe("region-03");
    expect(nextRegionName([{ ...band, name: "custom" }])).toBe("region-01");
    expect(nextRegionName([{ ...band, name: "region-120" }])).toBe(
      "region-121",
    );
  });
});

describe("selectionToRegion", () => {
  it("keeps only spatial axes", () => {
    expect(
      selectionToRegion({ kind: "range", min: 2, max: 1 }, { x: "x" }),
    ).toEqual({ ranges: { x: { min: 1, max: 2 } } });
    expect(
      selectionToRegion({ kind: "range", min: 1, max: 2 }, { x: "gamma" }),
    ).toBeNull();
    // A band on an x–ux phase plot.
    expect(
      selectionToRegion(
        { kind: "box", xMin: 0, xMax: 1, yMin: -5, yMax: 5 },
        { x: "x", y: "ux" },
      ),
    ).toEqual({ ranges: { x: { min: 0, max: 1 } } });
    expect(
      selectionToRegion(
        { kind: "box", xMin: 0, xMax: 1, yMin: 3, yMax: 2 },
        { x: "x", y: "y" },
      ),
    ).toEqual({ ranges: { x: { min: 0, max: 1 }, y: { min: 2, max: 3 } } });
  });

  it("needs two spatial axes and three points for a lasso", () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    expect(
      selectionToRegion({ kind: "lasso", points }, { x: "x", y: "y" }),
    ).toEqual({ polygon: { x: "x", y: "y", points } });
    expect(
      selectionToRegion({ kind: "lasso", points }, { x: "x", y: "ux" }),
    ).toBeNull();
    expect(
      selectionToRegion(
        { kind: "lasso", points: points.slice(0, 2) },
        { x: "x", y: "y" },
      ),
    ).toBeNull();
  });
});

describe("withRegion / withoutRegion", () => {
  it("saves under the next name", () => {
    const next = withRegion(state([band]), {
      ranges: { y: { min: 0, max: 1 } },
    });
    expect(next.regions?.map((r) => r.name)).toEqual([
      "region-01",
      "region-02",
    ]);
  });

  it("removes a region and every reference to it", () => {
    const next = withoutRegion(state([band, lasso]), "region-01");
    expect(next.regions).toEqual([lasso]);
    expect(next.plotters.phase.particlePhaseConfig?.regions).toEqual([
      "region-02",
    ]);
    const series = next.plotters.spectrum.particleHistogramConfig?.series;
    expect(series?.[0].regions).toEqual([]);
    expect(series?.[1].regions).toBeUndefined();
  });

  it("resolves names to existing regions", () => {
    expect(pickRegions(["region-02", "gone"], [band, lasso])).toEqual([lasso]);
    expect(existingRegionNames(["gone", "region-01"], [band])).toEqual([
      "region-01",
    ]);
  });
});

describe("regionOnAxes", () => {
  it("shows a lasso on the axes it was drawn on, either way round", () => {
    expect(regionOnAxes(lasso, "x", "y")?.polygon).toEqual(
      lasso.polygon?.points,
    );
    expect(regionOnAxes(lasso, "y", "x")?.polygon).toEqual([
      [0, 0],
      [0, 2],
      [4, 0],
    ]);
  });

  it("otherwise shows its extent along spatial axes", () => {
    expect(regionOnAxes(lasso, "x")).toEqual({
      name: "region-02",
      x: [0, 2],
      y: undefined,
    });
    expect(regionOnAxes(lasso, "x", "ux")).toEqual({
      name: "region-02",
      x: [0, 2],
      y: undefined,
    });
    expect(regionOnAxes(band, "x", "y")).toEqual({
      name: "region-01",
      x: [0, 1],
      y: undefined,
    });
    expect(regionOnAxes(band, "y", "ux")).toBeNull();
    expect(regionOnAxes(band, "gamma")).toBeNull();
  });
});

describe("region colors and visibility", () => {
  it("colors regions by number, wrapping around the palette", () => {
    expect(regionColor("region-01")).toBe(REGION_COLORS[0]);
    expect(regionColor("region-03")).toBe(REGION_COLORS[2]);
    expect(regionColor(`region-${REGION_COLORS.length + 1}`)).toBe(
      REGION_COLORS[0],
    );
    expect(REGION_COLORS).toContain(regionColor("custom"));
    expect(regionsOnAxes([band, lasso], "x").map((r) => r.color)).toEqual([
      REGION_COLORS[0],
      REGION_COLORS[1],
    ]);
  });

  it("hides regions on 2D plots unless asked", () => {
    expect(regionsShown({}, true)).toBe(false);
    expect(regionsShown({}, false)).toBe(true);
    expect(regionsShown({ showRegions: true }, true)).toBe(true);
    expect(regionsShown({ showRegions: false }, false)).toBe(false);
  });
});

describe("helpers", () => {
  it("describes regions", () => {
    expect(describeRegion(band, String)).toBe("x ∈ [0, 1]");
    expect(describeRegion(lasso, String)).toBe("lasso in x–y (3 points)");
  });

  it("thins paths", () => {
    const path: [number, number][] = [
      [0, 0],
      [1, 0],
      [5, 0],
      [5, 1],
      [10, 0],
    ];
    expect(simplifyPath(path, 3)).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
    ]);
    const long = Array.from({ length: 1000 }, (_, i): [number, number] => [
      i * 10,
      0,
    ]);
    expect(simplifyPath(long, 3, 100)).toHaveLength(100);
  });

  it("computes polygon areas", () => {
    expect(polygonArea(lasso.polygon!.points)).toBe(4);
  });
});
