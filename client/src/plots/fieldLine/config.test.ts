import { describe, expect, it } from "vitest";
import { DataType, IPlotter, IUiState, PlotType } from "../../state/schema";
import {
  activeLineRange,
  effectiveAxis,
  lineAxes,
  lineRequest,
  sliceDims,
  toggleQuantity,
  withAxisRange,
  withLineRange,
} from "./config";

describe("effectiveAxis / sliceDims", () => {
  it("keeps a valid configured axis", () => {
    expect(effectiveAxis("y", ["x", "y"])).toBe("y");
  });

  it("falls back to the first dim for empty or invalid axes", () => {
    expect(effectiveAxis("", ["x", "y"])).toBe("x");
    expect(effectiveAxis("z", ["x", "y"])).toBe("x");
    expect(effectiveAxis("x", [])).toBe("");
  });

  it("slices every dim except the plotted one", () => {
    expect(sliceDims(["x", "y", "z"], "y")).toEqual(["x", "z"]);
  });
});

describe("toggleQuantity", () => {
  it("appends new quantities and removes selected ones", () => {
    expect(toggleQuantity(["B"], "N_1")).toEqual(["B", "N_1"]);
    expect(toggleQuantity(["B", "N_1"], "B")).toEqual(["N_1"]);
  });
});

describe("activeLineRange", () => {
  const base: IPlotter = { plotType: PlotType.Line, dataType: DataType.Fields };
  const global = { x: { min: 1, max: 2 } };

  it("uses the synced range for the plot's own axis", () => {
    expect(activeLineRange(base, global, "x")).toEqual({ min: 1, max: 2 });
  });

  it("is not affected by synced zoom along another axis", () => {
    expect(activeLineRange(base, global, "y")).toBeNull();
  });

  it("uses the local range when sync is off", () => {
    const local = {
      ...base,
      useGlobalViewport: false,
      lineViewport: { min: 5, max: 6 },
    };
    expect(activeLineRange(local, global, "x")).toEqual({ min: 5, max: 6 });
  });
});

describe("withAxisRange", () => {
  it("sets one axis without touching the others", () => {
    const next = withAxisRange({ y: { min: 0, max: 1 } }, "x", {
      min: 2,
      max: 3,
    });
    expect(next).toEqual({ y: { min: 0, max: 1 }, x: { min: 2, max: 3 } });
  });

  it("clears an axis on null", () => {
    expect(withAxisRange({ x: { min: 0, max: 1 } }, "x", null)).toEqual({});
  });

  it("returns the same object when nothing changes", () => {
    const viewports = { x: { min: 0, max: 1 } };
    expect(withAxisRange(viewports, "x", { min: 0, max: 1 })).toBe(viewports);
    expect(withAxisRange(viewports, "y", null)).toBe(viewports);
  });
});

describe("lineRequest", () => {
  it("drops display-only limits and scale so changing them doesn't refetch", () => {
    const config = {
      quantities: ["B"],
      axis: "x",
      slices: { y: 1 },
      yMin: 0,
      yMax: 1,
      yScale: "power" as const,
      yPower: 0.3,
    };
    expect(lineRequest(config)).toEqual({
      quantities: ["B"],
      axis: "x",
      slices: { y: 1 },
    });
  });
});

describe("withLineRange", () => {
  const plotter: IPlotter = {
    plotType: PlotType.Line,
    dataType: DataType.Fields,
  };
  const state = {
    plotters: {
      synced: plotter,
      local: { ...plotter, useGlobalViewport: false },
    },
    globalLineViewports: {},
  } as unknown as IUiState;
  const range = { min: 1, max: 2 };

  it("writes the shared range of the axis for synced plots", () => {
    expect(
      withLineRange(state, "synced", "x", range).globalLineViewports,
    ).toEqual({ x: range });
  });

  it("keeps an unsynced plot's range on the plot", () => {
    const next = withLineRange(state, "local", "x", range);
    expect(next.plotters.local.lineViewport).toEqual(range);
    expect(next.globalLineViewports).toEqual({});
  });

  it("returns the same state when nothing changes", () => {
    expect(withLineRange(state, "synced", "x", null)).toBe(state);
    expect(withLineRange(state, "nope", "x", range)).toBe(state);
  });
});

describe("transformed axes", () => {
  it("offers x′ next to x and slices neither when one is plotted", () => {
    const metadata = {
      fields: [{ name: "f", dims: ["x", "y"] }],
      vectors: [],
      coords: { x: [0, 1], xp: [0, 2], y: [0, 1] },
    };
    expect(lineAxes(metadata, ["f"])).toEqual(["x", "xp", "y"]);
    expect(sliceDims(["x", "y"], "xp")).toEqual(["y"]);
  });
});
