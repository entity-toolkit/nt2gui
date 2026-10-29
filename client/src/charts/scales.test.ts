import { describe, expect, it } from "vitest";
import {
  scaledLength,
  binIndex,
  logValueDomain,
  makeScale,
  scaleExtent,
  stepPath,
  nearestIndex,
  panScale,
  valueBounds,
  paddedExtent,
  valueDomain,
} from "./scales";

describe("makeScale", () => {
  it("maps log data uniformly in log10", () => {
    const scale = makeScale("log").domain([1, 100]).range([0, 100]);
    expect(scale(10)).toBeCloseTo(50);
  });

  it("maps the power stretch sign(A)|A|^p, keeping the sign", () => {
    const scale = makeScale("power", 0.5).domain([-4, 4]).range([-2, 2]);
    expect(scale(-4)).toBeCloseTo(-2);
    expect(scale(1)).toBeCloseTo(1); // sqrt(1) = 1 of sqrt(4) = 2
    expect(scale.invert(1)).toBeCloseTo(1);
  });

  it("is linear by default", () => {
    expect(makeScale().domain([0, 10]).range([0, 1])(5)).toBeCloseTo(0.5);
  });
});

describe("scaleExtent", () => {
  it("skips non-finite values, and non-positive ones for log", () => {
    expect(scaleExtent([-1, 0, 5, null, NaN], "linear")).toEqual([-1, 5]);
    expect(scaleExtent([-1, 0, 5, 2], "log")).toEqual([2, 5]);
    expect(scaleExtent([0, -3], "log")).toBeNull();
  });
});

describe("logValueDomain", () => {
  it("pads the data by a factor", () => {
    expect(logValueDomain([2, 30])).toEqual({
      domain: [2 / 1.5, 45],
      fixed: false,
    });
    expect(logValueDomain([5, 5])).toEqual({ domain: [0.5, 50], fixed: false });
    expect(logValueDomain(null)).toEqual({ domain: [1, 10], fixed: false });
  });

  it("uses positive user limits and ignores invalid ones", () => {
    expect(logValueDomain([2, 30], 1, 100)).toEqual({
      domain: [1, 100],
      fixed: true,
    });
    expect(logValueDomain([2, 30], 0)).toEqual({
      domain: [2 / 1.5, 45],
      fixed: false,
    });
    expect(logValueDomain([2, 30], 50)).toEqual({
      domain: [2 / 1.5, 45],
      fixed: false,
    });
  });
});

describe("binIndex", () => {
  it("finds the bin containing a value", () => {
    const edges = [0, 1, 2, 3];
    expect(binIndex(edges, 0.5)).toBe(0);
    expect(binIndex(edges, 2.9)).toBe(2);
    expect(binIndex(edges, 3)).toBe(2); // last edge closes the last bin
    expect(binIndex(edges, -1)).toBe(0);
  });
});

describe("stepPath", () => {
  const identity = (v: number) => v;
  const positive = (v: number | null): v is number => v !== null && v > 0;

  it("draws a flat segment per bin, joined vertically", () => {
    expect(stepPath([0, 1, 2], [5, 3], identity, identity, positive)).toBe(
      "M0,5L1,5L1,3L2,3",
    );
  });

  it("keeps isolated bins next to gaps", () => {
    expect(
      stepPath([0, 1, 2, 3], [0, 4, 0], identity, identity, positive),
    ).toBe("M1,4L2,4");
    expect(
      stepPath([0, 1, 2, 3], [2, 0, 7], identity, identity, positive),
    ).toBe("M0,2L1,2M2,7L3,7");
  });

  it("is empty when nothing can be drawn", () => {
    expect(stepPath([0, 1], [0], identity, identity, positive)).toBe("");
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

describe("valueDomain", () => {
  it("is the padded data extent without limits", () => {
    expect(valueDomain([0, 10])).toEqual({
      domain: [-0.5, 10.5],
      fixed: false,
    });
  });

  it("uses both limits when given", () => {
    expect(valueDomain([0, 10], -1, 2)).toEqual({
      domain: [-1, 2],
      fixed: true,
    });
  });

  it("fills a missing side from the data", () => {
    expect(valueDomain([0, 10], 5)).toEqual({ domain: [5, 10.5], fixed: true });
    expect(valueDomain([0, 10], undefined, 4)).toEqual({
      domain: [-0.5, 4],
      fixed: true,
    });
  });

  it("ignores limits that would invert the axis", () => {
    expect(valueDomain([0, 10], 3, 3)).toEqual({
      domain: [-0.5, 10.5],
      fixed: false,
    });
    expect(valueDomain([0, 10], 20)).toEqual({
      domain: [-0.5, 10.5],
      fixed: false,
    });
  });

  it("falls back to [0, 1] without data", () => {
    expect(valueDomain(null)).toEqual({ domain: [0, 1], fixed: false });
    expect(valueDomain(null, 2, 5)).toEqual({ domain: [2, 5], fixed: true });
  });
});

describe("paddedExtent", () => {
  it("pads ranges and widens flat lines", () => {
    expect(paddedExtent([0, 10])).toEqual([-0.5, 10.5]);
    expect(paddedExtent([0, 0])).toEqual([-1, 1]);
    expect(paddedExtent([5, 5])).toEqual([4.5, 5.5]);
  });
});

describe("panScale", () => {
  const linear = () => makeScale().domain([2, 4]).range([0, 100]);

  it("dragging right shows what is to the left", () => {
    const { shift, domain } = panScale(linear(), 50);
    expect(shift).toBe(50);
    expect(domain[0]).toBeCloseTo(1);
    expect(domain[1]).toBeCloseTo(3);
  });

  it("stops at the bounds", () => {
    expect(panScale(linear(), 500, [0, 10]).domain[0]).toBeCloseTo(0);
    expect(panScale(linear(), -500, [0, 10]).domain[1]).toBeCloseTo(10);
    expect(panScale(linear(), 20, [0, 10]).shift).toBe(20); // within: untouched
  });

  it("doesn't move a view wider than its bounds", () => {
    expect(panScale(linear(), 30, [2.5, 3]).shift).toBe(0);
  });

  it("works for inverted (y) scales", () => {
    // Dragging content down (positive pixels) shows what is above.
    const y = makeScale().domain([0, 10]).range([100, 0]);
    const { domain } = panScale(y, 10);
    expect(domain[0]).toBeCloseTo(1);
    expect(domain[1]).toBeCloseTo(11);
    expect(panScale(y, 50, [0, 12]).domain[1]).toBeCloseTo(12);
  });

  it("pans log scales by a constant factor", () => {
    const log = makeScale("log").domain([10, 100]).range([0, 100]);
    const { domain } = panScale(log, -100);
    expect(domain[0]).toBeCloseTo(100);
    expect(domain[1]).toBeCloseTo(1000);
  });
});

describe("valueBounds", () => {
  it("is the extent of the values", () => {
    expect(valueBounds([3, 1, 2])).toEqual([1, 3]);
    expect(valueBounds([])).toBeUndefined();
    expect(valueBounds(undefined)).toBeUndefined();
  });
});

describe("scaledLength", () => {
  it("measures in the scale's own space", () => {
    expect(scaledLength("linear", undefined, -2, 3)).toBe(5);
    expect(scaledLength("log", undefined, 1, 1000)).toBeCloseTo(3);
    expect(scaledLength("power", 0.5, -4, 9)).toBeCloseTo(5);
  });

  it("is 0 for ranges a log scale can't show", () => {
    expect(scaledLength("log", undefined, 0, 10)).toBe(0);
  });
});
