import { describe, expect, it } from "vitest";
import {
  formatAxes,
  formatCount,
  formatMass,
  formatNumber,
  formatRange,
  formatResolution,
  formatTimes,
} from "./summaryFormat";

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [0.35355, "0.354"],
    [9.899, "9.9"],
    [32, "32"],
    [995.00006, "995"],
    [12345, "1.23e+4"],
    [0.00012, "1.2e-4"],
    [-2.5, "-2.5"],
  ])("%s -> %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});

describe("summary text", () => {
  it("formats counts and ranges", () => {
    expect(formatCount(1098240)).toBe("1,098,240");
    expect(formatRange(0.5, 31.5)).toBe("0.5 – 31.5");
    expect(formatRange(2, 2)).toBe("2");
  });

  it("formats output times", () => {
    expect(formatTimes({ count: 28, min: 0.35355, max: 9.899 })).toBe(
      "28 outputs, t = 0.354 – 9.9",
    );
    expect(formatTimes({ count: 1, min: 2, max: 2 })).toBe("1 output, t = 2");
    expect(formatTimes(null)).toBe("no outputs");
  });

  it("formats grids", () => {
    const axes = [
      { name: "y", size: 32, min: 0.5, max: 31.5 },
      { name: "x", size: 64, min: 0, max: 10 },
      { name: "E", size: 100 },
    ];
    expect(formatResolution(axes)).toBe("32 × 64 × 100");
    expect(formatAxes(axes)).toEqual([
      "y ∈ 0.5 – 31.5 (32)",
      "x ∈ 0 – 10 (64)",
      "E (100)",
    ]);
  });

  it("formats masses", () => {
    expect(formatMass(0)).toBe("massless");
    expect(formatMass(1)).toBe("m = 1");
    expect(formatMass(null)).toBe("mass unknown");
  });
});
