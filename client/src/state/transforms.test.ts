import { describe, expect, it } from "vitest";
import { DataType, IUiState, PlotType } from "./schema";
import {
  baseOf,
  coordinateLabel,
  timeAxisFor,
  timelineMoves,
  withPrimed,
  cleanTransforms,
  isMovingFrame,
  metadataFrame,
  timeChanged,
  withTransforms,
  withoutPrimed,
} from "./transforms";

const state = (): IUiState => ({
  layout: { global: {}, layout: { type: "row", children: [] } },
  plotters: {
    a: {
      plotType: PlotType.Line,
      dataType: DataType.Fields,
      lineViewport: { min: 0, max: 1 },
      useGlobalViewport: false,
    },
  },
  timeline: { current: 1, min: 0, max: 2, step: 1 },
  globalViewport: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
  globalLineViewports: { x: { min: 0, max: 1 } },
  coordinateTransforms: { x: "x / 2" },
});

describe("transforms", () => {
  it("keeps only non-empty known transforms", () => {
    expect(cleanTransforms({ x: " x/2 ", y: " ", ux: "ux" })).toEqual({
      x: "x/2",
    });
  });

  it("tells a moving frame by spatial transforms using t", () => {
    expect(isMovingFrame({ x: "x - setup.v * t" })).toBe(true);
    expect(isMovingFrame({ t: "t * 2", x: "x / t0" })).toBe(false);
    expect(isMovingFrame({ x: "x - grid.t" })).toBe(false);
    expect(metadataFrame({ x: "x - t" }, 3)).toEqual({
      transforms: { x: "x - t" },
      time: 3,
    });
    expect(metadataFrame({ x: "x / 2" }, 3)).toEqual({
      transforms: { x: "x / 2" },
    });
    expect(metadataFrame({}, 3)).toBeNull();
  });

  it("resets zooms only when a spatial transform changes", () => {
    const timeOnly = withTransforms(
      state(),
      { x: "x / 2", t: "t * 3" },
      { current: 3, min: 0, max: 6, step: 3 },
    );
    expect(timeOnly.globalViewport).not.toBeNull();
    expect(timeOnly.timeline.max).toBe(6);
    const moved = withTransforms(state(), { x: "x / 4" });
    expect(moved.globalViewport).toBeNull();
    expect(moved.globalLineViewports).toEqual({});
    expect(moved.plotters.a.lineViewport).toBeNull();
    expect(moved.timeline).toEqual(state().timeline);
    expect(timeChanged({ t: "t*2" }, { t: " t*2 " })).toBe(false);
    expect(timeChanged(undefined, { t: "t*2" })).toBe(true);
  });
});

describe("primed coordinates", () => {
  it("names, labels and lists them next to their originals", () => {
    expect(baseOf("xp")).toBe("x");
    expect(baseOf("thp")).toBe("th");
    expect(baseOf("Bx")).toBe("Bx");
    expect(coordinateLabel("tp")).toBe("t′");
    expect(coordinateLabel("x")).toBe("x");
    expect(withPrimed(["x", "y"], ["x", "xp", "y"])).toEqual(["x", "xp", "y"]);
  });

  it("runs the timeline in t′ only while time is transformed", () => {
    expect(timeAxisFor({ t: "t*2" }, "tp")).toBe("tp");
    expect(timeAxisFor({}, "tp")).toBe("t");
    expect(timeAxisFor({ t: "t*2" }, undefined)).toBe("t");
    // Switching axis, or changing t's transform while in t′, moves it.
    expect(timelineMoves({ t: "t*2" }, "t", { t: "t*2" }, "tp")).toBe(true);
    expect(timelineMoves({ t: "t*2" }, "t", { t: "t*3" }, "t")).toBe(false);
    expect(timelineMoves({ t: "t*2" }, "tp", { t: "t*3" }, "tp")).toBe(true);
    expect(timelineMoves({ t: "t*2" }, "tp", {}, "t")).toBe(true);
  });

  it("drops t′ when time's transform is removed", () => {
    const next = withTransforms({ ...state(), timeAxis: "tp" }, { x: "x / 2" });
    expect(next.timeAxis).toBe("t");
  });
});

describe("removing a transform", () => {
  const primedPlots = (): IUiState => ({
    ...state(),
    coordinateTransforms: { x: "x / 2", y: "y * 3", t: "t * 10" },
    plotters: {
      line: {
        plotType: PlotType.Line,
        dataType: DataType.Fields,
        lineConfig: {
          quantities: ["Ex"],
          axis: "xp",
          slices: { y: 0.5 },
          smoothing: { xp: 2 },
        },
        lineViewport: { min: 1, max: 2 },
      },
      image: {
        plotType: PlotType.Pseudocolor,
        dataType: DataType.Fields,
        pseudocolorConfig: {
          field: "Ex",
          xCoordinate: "xp",
          yCoordinate: "yp",
          colorMap: "viridis",
          smoothing: { xp: 1, yp: 4 },
        },
      },
      phase: {
        plotType: PlotType.Pseudocolor,
        dataType: DataType.Particles,
        particlePhaseConfig: {
          x: { quantity: "xp", scale: "linear", min: 0, max: 5, bins: 64 },
          y: { quantity: "ux", scale: "linear", min: -1, max: 1 },
        },
      },
      untouched: {
        plotType: PlotType.Line,
        dataType: DataType.Fields,
        lineConfig: { quantities: ["Ex"], axis: "z", slices: {} },
      },
    },
  });

  it("puts plots on its primed coordinate back on the original", () => {
    const next = withTransforms(primedPlots(), { y: "y * 3", t: "t * 10" });
    expect(next.plotters.line.lineConfig).toEqual({
      quantities: ["Ex"],
      axis: "x",
      slices: { y: 0.5 },
    });
    expect(next.plotters.line.lineViewport).toBeNull();
    // y′ is still there.
    expect(next.plotters.image.pseudocolorConfig).toMatchObject({
      xCoordinate: "x",
      yCoordinate: "yp",
      smoothing: { yp: 4 },
    });
    expect(next.plotters.phase.particlePhaseConfig).toEqual({
      x: { quantity: "x", scale: "linear", bins: 64 },
      y: { quantity: "ux", scale: "linear", min: -1, max: 1 },
    });
    expect(next.plotters.untouched).toEqual(primedPlots().plotters.untouched);
    const untouched = primedPlots().plotters.untouched;
    expect(withoutPrimed(untouched, ["xp"])).toBe(untouched);
  });

  it("keeps plots as they are when a transform only changes", () => {
    const next = withTransforms(primedPlots(), {
      x: "x / 4",
      y: "y * 3",
      t: "t * 10",
    });
    expect(next.plotters.line.lineConfig?.axis).toBe("xp");
    expect(next.plotters.line.lineConfig?.smoothing).toEqual({ xp: 2 });
    expect(next.plotters.image.pseudocolorConfig?.xCoordinate).toBe("xp");
  });

  it("removes every primed coordinate at once", () => {
    const next = withTransforms(primedPlots(), {});
    const image = next.plotters.image.pseudocolorConfig!;
    expect([image.xCoordinate, image.yCoordinate]).toEqual(["x", "y"]);
    expect(image.smoothing).toBeUndefined();
  });
});
