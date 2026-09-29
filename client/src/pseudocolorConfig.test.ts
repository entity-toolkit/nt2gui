import { describe, expect, it } from "vitest";
import { defaultPseudocolorConfig, IFieldMetadata } from "./global";
import {
  fieldDims,
  isPseudocolorField,
  pseudocolorSliceDims,
  validAxes,
  withCoordinate,
  withField,
} from "./pseudocolorConfig";

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

const config = { ...defaultPseudocolorConfig, xCoordinate: "x", yCoordinate: "y" };

describe("isPseudocolorField", () => {
  it("requires two or more spatial dims", () => {
    expect(metadata.fields.filter(isPseudocolorField).map((f) => f.name)).toEqual([
      "f",
      "rho",
      "side",
    ]);
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
    expect(next).toMatchObject({ field: "side", xCoordinate: "y", yCoordinate: "z" });
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
    expect(pseudocolorSliceDims(metadata, { ...config, field: "rho" })).toEqual(["z"]);
    expect(
      pseudocolorSliceDims(metadata, { ...config, field: "rho", yCoordinate: "z" }),
    ).toEqual(["y"]);
  });

  it("needs no slider for 2D fields or unknown fields", () => {
    expect(pseudocolorSliceDims(metadata, { ...config, field: "f" })).toEqual([]);
    expect(pseudocolorSliceDims(metadata, { ...config, field: "" })).toEqual([]);
  });
});
