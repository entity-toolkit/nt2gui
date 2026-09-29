import { describe, expect, it } from "vitest";
import { fitToBox } from "./fitToBox";

describe("fitToBox", () => {
  it("is limited by the height in a wide box", () => {
    expect(fitToBox({ width: 200, height: 100 }, { width: 1000, height: 300 })).toEqual({
      width: 600,
      height: 300,
    });
  });

  it("is limited by the width in a tall box", () => {
    expect(fitToBox({ width: 200, height: 100 }, { width: 400, height: 1000 })).toEqual({
      width: 400,
      height: 200,
    });
  });

  it("scales up small content to fill the box", () => {
    expect(fitToBox({ width: 10, height: 10 }, { width: 500, height: 300 })).toEqual({
      width: 300,
      height: 300,
    });
  });

  it("collapses to zero for degenerate sizes", () => {
    expect(fitToBox({ width: 0, height: 10 }, { width: 500, height: 300 })).toEqual({
      width: 0,
      height: 0,
    });
    expect(fitToBox({ width: 10, height: 10 }, { width: 0, height: 300 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});
