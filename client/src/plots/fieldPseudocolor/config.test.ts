import { describe, expect, it } from "vitest";
import { IFieldMetadata } from "../../api/types";
import { DataType, IPlotter, IUiState, PlotType } from "../../state/schema";
import {
  activeViewport,
  defaultPseudocolorConfig,
  fieldDims,
  isPseudocolorField,
  pseudocolorSliceDims,
  validAxes,
  withCoordinate,
  withField,
  withViewport,
} from "./config";

const metadata: IFieldMetadata = {
  fields: [
    { name: "f", dims: ["x", "y"] },
    { name: "rho", dims: ["x", "y", "z"] },
    { name: "side", dims: ["y", "z"] },
    { name: "profile", dims: ["x"] },
  ],
  vectors: [],
  coords: {},
};

const config = {
  ...defaultPseudocolorConfig,
  xCoordinate: "x",
  yCoordinate: "y",
};

describe("isPseudocolorField", () => {
  it("requires two or more spatial dims", () => {
    expect(
      metadata.fields.filter(isPseudocolorField).map((f) => f.name),
    ).toEqual(["f", "rho", "side"]);
  });
});

describe("fieldDims", () => {
  it("uses the selected field's dims", () => {
    expect(fieldDims(metadata, "side")).toEqual(["y", "z"]);
  });

  it("offers every dim when no known field is selected", () => {
    expect(fieldDims(metadata, "")).toEqual(["x", "y", "z"]);
  });
});

describe("validAxes", () => {
  it("keeps a valid pair", () => {
    expect(validAxes(["x", "y", "z"], "z", "x")).toEqual({
      xCoordinate: "z",
      yCoordinate: "x",
    });
  });

  it("replaces dims the field lacks, keeping them distinct", () => {
    expect(validAxes(["y", "z"], "x", "y")).toEqual({
      xCoordinate: "y",
      yCoordinate: "z",
    });
  });

  it("never returns the same dim twice", () => {
    expect(validAxes(["x", "y"], "x", "x")).toEqual({
      xCoordinate: "x",
      yCoordinate: "y",
    });
  });
});

describe("withField", () => {
  it("adapts the axes to the new field", () => {
    const next = withField(config, "side", metadata);
    expect(next).toMatchObject({
      field: "side",
      xCoordinate: "y",
      yCoordinate: "z",
    });
  });

  it("keeps axes that remain valid", () => {
    const next = withField({ ...config, xCoordinate: "z" }, "rho", metadata);
    expect(next).toMatchObject({ xCoordinate: "z", yCoordinate: "y" });
  });
});

describe("withCoordinate", () => {
  it("sets an axis", () => {
    expect(withCoordinate(config, "y", "z")).toMatchObject({
      xCoordinate: "x",
      yCoordinate: "z",
    });
  });

  it("swaps when picking the other axis's dim", () => {
    expect(withCoordinate(config, "x", "y")).toMatchObject({
      xCoordinate: "y",
      yCoordinate: "x",
    });
  });

  it("returns the same config when nothing changes", () => {
    expect(withCoordinate(config, "x", "x")).toBe(config);
  });
});

describe("pseudocolorSliceDims", () => {
  it("slices a 3D field along the dim that is not plotted", () => {
    expect(pseudocolorSliceDims(metadata, { ...config, field: "rho" })).toEqual(
      ["z"],
    );
    expect(
      pseudocolorSliceDims(metadata, {
        ...config,
        field: "rho",
        yCoordinate: "z",
      }),
    ).toEqual(["y"]);
  });

  it("needs no slider for 2D fields or unknown fields", () => {
    expect(pseudocolorSliceDims(metadata, { ...config, field: "f" })).toEqual(
      [],
    );
    expect(pseudocolorSliceDims(metadata, { ...config, field: "" })).toEqual(
      [],
    );
  });
});

describe("zoom", () => {
  const plotter: IPlotter = {
    plotType: PlotType.Pseudocolor,
    dataType: DataType.Fields,
  };
  const window = { xMin: 0, xMax: 1, yMin: 2, yMax: 3 };
  const state = {
    plotters: {
      synced: plotter,
      local: { ...plotter, useGlobalViewport: false },
    },
    globalViewport: null,
  } as unknown as IUiState;

  it("synced plots share the global viewport", () => {
    const next = withViewport(state, "synced", window);
    expect(next.globalViewport).toEqual(window);
    expect(activeViewport(next.plotters.synced, next.globalViewport)).toEqual(
      window,
    );
    expect(activeViewport(next.plotters.local, next.globalViewport)).toBeNull();
  });

  it("unsynced plots keep their own", () => {
    const next = withViewport(state, "local", window);
    expect(next.plotters.local.localViewport).toEqual(window);
    expect(next.globalViewport).toBeNull();
  });

  it("returns the same state when nothing changes", () => {
    expect(withViewport(state, "synced", null)).toBe(state);
    expect(withViewport(state, "nope", window)).toBe(state);
  });
});

describe("transformed axes", () => {
  const metadata = {
    fields: [{ name: "f", dims: ["x", "y", "z"] }],
    vectors: [],
    coords: { x: [0, 1], xp: [0, 2], y: [0, 1], z: [0, 1] },
  };
  it("offers x′ next to x and keeps the two axes on different dims", () => {
    expect(fieldDims(metadata, "f")).toEqual(["x", "xp", "y", "z"]);
    expect(validAxes(["x", "xp", "y"], "x", "xp")).toEqual({
      xCoordinate: "x",
      yCoordinate: "y",
    });
    const config = { ...defaultPseudocolorConfig, field: "f" };
    // Picking y's dim for x swaps; x′ replaces x.
    expect(withCoordinate(config, "x", "xp")).toMatchObject({
      xCoordinate: "xp",
      yCoordinate: "y",
    });
    expect(
      withCoordinate({ ...config, xCoordinate: "xp" }, "y", "x"),
    ).toMatchObject({ xCoordinate: "y", yCoordinate: "x" });
    expect(
      pseudocolorSliceDims(metadata, { ...config, xCoordinate: "xp" }),
    ).toEqual(["z"]);
  });
});
