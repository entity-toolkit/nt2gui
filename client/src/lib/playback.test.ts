import { describe, expect, it } from "vitest";
import { DataType, PlotType } from "../state/schema";
import { nextTime, panelTime } from "./playback";

const timeline = { current: 0, min: 0, max: 1, step: 0.25 };

describe("nextTime", () => {
  it("steps along the grid", () => {
    expect(nextTime(timeline)).toBe(0.25);
    expect(nextTime({ ...timeline, current: 0.5 })).toBe(0.75);
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
