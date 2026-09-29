import { describe, expect, it } from "vitest";
import { DataType, IFieldMetadata, IPlotter, PlotType } from "./global";
import {
  activeLineRange,
  effectiveAxis,
  expandQuantity,
  extentOf,
  nearestIndex,
  paddedExtent,
  quantityDims,
  sliceDims,
  toggleQuantity,
  valueDomain,
  lineRequest,
  withAxisRange,
  withSlice,
} from "./lineConfig";

const metadata: IFieldMetadata = {
  fields: [
    { name: "Bx", dims: ["x", "y"] },
    { name: "By", dims: ["x", "y"] },
    { name: "Bz", dims: ["x", "y"] },
    { name: "rho", dims: ["x", "y", "z"] },
    { name: "profile", dims: ["z"] },
  ],
  vectors: [{ name: "B", components: ["Bx", "By", "Bz"] }],
  coords: { x: [0, 1, 2], y: [-1, 0, 1], z: [10, 20] },
};

describe("expandQuantity", () => {
  it("expands a vector into its components", () => {
    expect(expandQuantity(metadata, "B")).toEqual(["Bx", "By", "Bz"]);
  });

  it("keeps a single component as is", () => {
    expect(expandQuantity(metadata, "Bx")).toEqual(["Bx"]);
  });

  it("returns nothing for unknown names", () => {
    expect(expandQuantity(metadata, "nope")).toEqual([]);
  });
});

describe("quantityDims", () => {
  it("unions the dims of the selected quantities in first-seen order", () => {
    expect(quantityDims(metadata, ["profile", "B"])).toEqual(["z", "x", "y"]);
  });

  it("offers every dimension when nothing is selected", () => {
    expect(quantityDims(metadata, [])).toEqual(["x", "y", "z"]);
  });
});

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

describe("nearestIndex", () => {
  it("finds the closest coordinate", () => {
    expect(nearestIndex([0, 1, 2, 3], 2.4)).toBe(2);
    expect(nearestIndex([0, 1, 2, 3], 2.6)).toBe(3);
    expect(nearestIndex([0, 1, 2, 3], -5)).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(nearestIndex([], 1)).toBe(0);
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
    const local = { ...base, useGlobalViewport: false, lineViewport: { min: 5, max: 6 } };
    expect(activeLineRange(local, global, "x")).toEqual({ min: 5, max: 6 });
  });
});

describe("withAxisRange", () => {
  it("sets one axis without touching the others", () => {
    const next = withAxisRange({ y: { min: 0, max: 1 } }, "x", { min: 2, max: 3 });
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

describe("withSlice", () => {
  it("updates one slice and keeps identity when unchanged", () => {
    const config = { quantities: [], axis: "x", slices: { y: 0 } };
    expect(withSlice(config, "z", 3).slices).toEqual({ y: 0, z: 3 });
    expect(withSlice(config, "y", 0)).toBe(config);
  });

  it("works on configs whose slices are optional", () => {
    const pseudocolor: { field: string; slices?: Record<string, number> } = {
      field: "rho",
    };
    expect(withSlice(pseudocolor, "z", 1)).toEqual({ field: "rho", slices: { z: 1 } });
  });
});

describe("extentOf / paddedExtent", () => {
  it("ignores nulls and non-finite values", () => {
    expect(extentOf([3, null, -1, NaN, Infinity, 2])).toEqual([-1, 3]);
    expect(extentOf([null])).toBeNull();
  });

  it("pads ranges and widens flat lines", () => {
    expect(paddedExtent([0, 10])).toEqual([-0.5, 10.5]);
    expect(paddedExtent([0, 0])).toEqual([-1, 1]);
    expect(paddedExtent([5, 5])).toEqual([4.5, 5.5]);
  });
});

describe("valueDomain", () => {
  it("is the padded data extent without limits", () => {
    expect(valueDomain([0, 10])).toEqual({ domain: [-0.5, 10.5], fixed: false });
  });

  it("uses both limits when given", () => {
    expect(valueDomain([0, 10], -1, 2)).toEqual({ domain: [-1, 2], fixed: true });
  });

  it("fills a missing side from the data", () => {
    expect(valueDomain([0, 10], 5)).toEqual({ domain: [5, 10.5], fixed: true });
    expect(valueDomain([0, 10], undefined, 4)).toEqual({ domain: [-0.5, 4], fixed: true });
  });

  it("ignores limits that would invert the axis", () => {
    expect(valueDomain([0, 10], 3, 3)).toEqual({ domain: [-0.5, 10.5], fixed: false });
    expect(valueDomain([0, 10], 20)).toEqual({ domain: [-0.5, 10.5], fixed: false });
  });

  it("falls back to [0, 1] without data", () => {
    expect(valueDomain(null)).toEqual({ domain: [0, 1], fixed: false });
    expect(valueDomain(null, 2, 5)).toEqual({ domain: [2, 5], fixed: true });
  });
});

describe("lineRequest", () => {
  it("drops display-only limits so changing them doesn't refetch", () => {
    const config = { quantities: ["B"], axis: "x", slices: { y: 1 }, yMin: 0, yMax: 1 };
    expect(lineRequest(config)).toEqual({ quantities: ["B"], axis: "x", slices: { y: 1 } });
  });
});
