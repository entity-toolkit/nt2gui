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
