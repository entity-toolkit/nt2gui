import { describe, expect, it } from "vitest";
import {
  assignSimulations,
  collectPanelIds,
  newPlotter,
  reconcilePlotters,
  setPlotType,
  updatePlotter,
} from "./plotters";
import { DataType, IPlotters, PlotType } from "./schema";

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
    const panelIds = collectPanelIds(sampleLayout as never);

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

describe("updatePlotter", () => {
  const plotters: IPlotters = {
    p: { ...newPlotter(), dataType: DataType.Fields },
  };

  it("merges a patch", () => {
    expect(
      updatePlotter(plotters, "p", { simulationId: "s" }).p.simulationId,
    ).toBe("s");
  });

  it("accepts a function of the current plotter", () => {
    const next = updatePlotter(plotters, "p", (p) => ({
      useGlobalViewport: !p.useGlobalViewport,
    }));
    expect(next.p.useGlobalViewport).toBe(false);
  });

  it("returns the same object when nothing changes or the panel is unknown", () => {
    expect(updatePlotter(plotters, "p", { dataType: DataType.Fields })).toBe(
      plotters,
    );
    expect(updatePlotter(plotters, "nope", { simulationId: "s" })).toBe(
      plotters,
    );
  });
});

describe("setPlotType", () => {
  it("sets the type and fills only missing defaults", () => {
    const plotters: IPlotters = {
      p: {
        ...newPlotter(),
        lineConfig: { quantities: ["B"], axis: "x", slices: {} },
      },
    };
    const next = setPlotType(plotters, "p", PlotType.Line, {
      lineConfig: { quantities: [], axis: "", slices: {} },
      lineViewport: null,
    });
    expect(next.p.plotType).toBe(PlotType.Line);
    expect(next.p.lineConfig?.quantities).toEqual(["B"]); // kept
    expect(next.p.lineViewport).toBeNull(); // filled
  });
});

describe("assignSimulations", () => {
  const plot = { ...newPlotter(), plotType: PlotType.Line };

  it("gives plots without a valid simulation the first one", () => {
    const next = assignSimulations(
      { a: plot, b: { ...plot, simulationId: "gone" } },
      ["s1", "s2"],
    );
    expect(next.a.simulationId).toBe("s1");
    expect(next.b.simulationId).toBe("s1");
  });

  it("keeps valid choices and ignores panels without a plot", () => {
    const plotters = { a: { ...plot, simulationId: "s2" }, b: newPlotter() };
    expect(assignSimulations(plotters, ["s1", "s2"])).toBe(plotters);
  });

  it("clears the simulation when none is loaded", () => {
    const next = assignSimulations({ a: { ...plot, simulationId: "s1" } }, []);
    expect(next.a.simulationId).toBeUndefined();
  });
});
