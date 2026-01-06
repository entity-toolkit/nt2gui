import { describe, expect, it } from "vitest";
import { PlotType, DataType } from "./global";
import { collectPanelIds, reconcilePlotters } from "./plotterSync";

const sampleLayout = {
  layout: {
    type: "row",
    children: [
      { type: "tab", component: "panel", id: "panel-1" },
      {
        type: "tabset",
        children: [{ type: "tab", component: "panel", id: "panel-2" }],
      },
    ],
  },
  borders: [
    {
      type: "border",
      children: [{ type: "tab", component: "panel", id: "border-panel" }],
    },
  ],
};

describe("collectPanelIds", () => {
  it("captures all panel ids including borders", () => {
    const panelIds = collectPanelIds(sampleLayout as any);

    expect(panelIds.size).toBe(3);
    expect(panelIds.has("panel-1")).toBe(true);
    expect(panelIds.has("panel-2")).toBe(true);
    expect(panelIds.has("border-panel")).toBe(true);
  });
});

describe("reconcilePlotters", () => {
  it("adds missing plotters for new panels", () => {
    const nextPlotters = reconcilePlotters({}, new Set(["panel-1"]));

    expect(nextPlotters).toEqual({
      "panel-1": {
        plotType: PlotType.None,
        dataType: DataType.None,
        useGlobalViewport: true,
        localViewport: null,
      },
    });
  });

  it("removes plotters for panels that were deleted", () => {
    const initial = {
      "panel-1": { plotType: PlotType.Line, dataType: DataType.Fields },
      "panel-2": { plotType: PlotType.None, dataType: DataType.None },
    };

    const next = reconcilePlotters(initial, new Set(["panel-1"]));

    expect(next).toEqual({ "panel-1": initial["panel-1"] });
  });

  it("returns the same reference when no changes are needed", () => {
    const initial = {
      "panel-1": {
        plotType: PlotType.None,
        dataType: DataType.None,
        useGlobalViewport: true,
        localViewport: null,
      },
    };
    const next = reconcilePlotters(initial, new Set(["panel-1"]));

    expect(next).toBe(initial);
  });
});
