import { describe, expect, it } from "vitest";
import { DataType, PlotType } from "../state/schema";
import {
  indexOfTime,
  nextTime,
  panelTime,
  stepCount,
  steppedTime,
  timeAtIndex,
  outsideSpan,
} from "./playback";

const timeline = { current: 0, min: 0, max: 1, step: 0.25 };

describe("nextTime", () => {
  it("steps along the grid", () => {
    expect(nextTime(timeline)).toBe(0.25);
    expect(nextTime({ ...timeline, current: 0.5 })).toBe(0.75);
  });

  it("lands on clean grid values", () => {
    expect(nextTime({ current: 0.2, min: 0, max: 1, step: 0.1 })).toBe(0.3);
  });

  it("snaps an off-grid time to the next grid point", () => {
    expect(nextTime({ ...timeline, current: 0.3 })).toBe(0.5);
  });

  it("lands exactly on max, then stops", () => {
    expect(nextTime({ ...timeline, current: 0.75 })).toBe(1);
    expect(nextTime({ ...timeline, current: 1 })).toBeNull();
    expect(nextTime({ current: 0, min: 0, max: 0.3, step: 0.1 })).toBe(0.1);
    expect(nextTime({ current: 0.2, min: 0, max: 0.3, step: 0.1 })).toBe(0.3);
  });

  it("handles a degenerate step", () => {
    expect(nextTime({ ...timeline, step: 0 })).toBeNull();
  });
});

describe("panelTime", () => {
  const global = { current: 0.5, min: 0, max: 1, step: 0.25 };
  const plotter = { plotType: PlotType.Line, dataType: DataType.Fields };

  it("follows the global time unless the panel is unsynced", () => {
    expect(panelTime(undefined, global)).toBe(0.5);
    expect(panelTime({ ...plotter, localTime: 0.25 }, global)).toBe(0.5);
    expect(
      panelTime({ ...plotter, syncTime: true, localTime: 0.25 }, global),
    ).toBe(0.5);
    expect(
      panelTime({ ...plotter, syncTime: false, localTime: 0.25 }, global),
    ).toBe(0.25);
  });

  it("falls back to the global time and clamps to the range", () => {
    expect(panelTime({ ...plotter, syncTime: false }, global)).toBe(0.5);
    expect(
      panelTime({ ...plotter, syncTime: false, localTime: 7 }, global),
    ).toBe(1);
    expect(
      panelTime({ ...plotter, syncTime: false, localTime: -1 }, global),
    ).toBe(0);
  });
});

describe("grid indices", () => {
  it("maps times to slider indices and back", () => {
    const grid = { current: 0, min: 0, max: 1, step: 0.1 };
    expect(stepCount(grid)).toBe(10);
    expect(timeAtIndex(grid, 3)).toBe(0.3);
    expect(timeAtIndex(grid, 10)).toBe(1);
    expect(indexOfTime(grid, 0.3)).toBe(3);
    expect(indexOfTime(grid, 0.34)).toBe(3);
    expect(indexOfTime(grid, 1)).toBe(10);
    expect(indexOfTime(grid, -5)).toBe(0);
  });

  it("ends on max when it is off the grid", () => {
    const grid = { current: 0, min: 0, max: 0.3, step: 0.25 };
    expect(stepCount(grid)).toBe(2);
    expect(timeAtIndex(grid, 1)).toBe(0.25);
    expect(timeAtIndex(grid, 2)).toBe(0.3);
    expect(indexOfTime(grid, 0.3)).toBe(2);
    expect(indexOfTime(grid, 0.27)).toBe(1);
  });

  it("handles an empty timeline", () => {
    const grid = { current: 0, min: 0, max: 0, step: 1 };
    expect(stepCount(grid)).toBe(0);
    expect(timeAtIndex(grid, 0)).toBe(0);
    expect(indexOfTime(grid, 0)).toBe(0);
  });
});

describe("steppedTime", () => {
  it("moves one grid point either way, stopping at the ends", () => {
    const timeline = { current: 0.5, min: 0, max: 1, step: 0.25 };
    expect(steppedTime(timeline, 1)).toBe(0.75);
    expect(steppedTime(timeline, -1)).toBe(0.25);
    expect(steppedTime({ ...timeline, current: 0 }, -1)).toBeNull();
    expect(steppedTime({ ...timeline, current: 1 }, 1)).toBeNull();
    expect(steppedTime({ ...timeline, current: 0.75 }, 1)).toBe(1);
    // Off-grid times step from the nearest grid point.
    expect(steppedTime({ ...timeline, current: 0.3 }, 1)).toBe(0.5);
  });
});

describe("outsideSpan", () => {
  const span = { min: 0, max: 1 };
  it("tells before the first and after the last output", () => {
    expect(outsideSpan(-0.1, span)).toBe("before");
    expect(outsideSpan(1.5, span)).toBe("after");
    expect(outsideSpan(0.5, span)).toBeNull();
    expect(outsideSpan(1, span)).toBeNull();
  });

  it("ignores the timeline grid's rounding", () => {
    expect(outsideSpan(1 + 1e-9, span)).toBeNull();
  });
});
