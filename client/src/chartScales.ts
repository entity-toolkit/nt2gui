import {
  scaleLinear,
  scaleLog,
  scalePow,
  type ScaleContinuousNumeric,
} from "d3";
import { DEFAULT_PARTICLE_POWER, ParticleScale } from "./global";

export type ContinuousScale = ScaleContinuousNumeric<number, number>;

/**
 * A d3 scale matching how the server bins: linear, log10, or the power
 * stretch sign(A)·|A|^p. d3's pow scale is sign-preserving, which is exactly
 * that stretch, so axes stay labelled in real data units.
 */
export const makeScale = (
  kind: ParticleScale = "linear",
  power: number = DEFAULT_PARTICLE_POWER,
): ContinuousScale => {
  if (kind === "log") return scaleLog();
  if (kind === "power") return scalePow().exponent(power);
  return scaleLinear();
};

/** Finite (and, for log scales, positive) [min, max] of the values. */
export const scaleExtent = (
  values: Iterable<number | null>,
  kind: ParticleScale = "linear",
): [number, number] | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    if (kind === "log" && value <= 0) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : null;
};

/**
 * Value-axis domain for a log scale: user limits where valid, else the
 * positive data padded by a factor, so lines don't touch the frame.
 */
export const logValueDomain = (
  extent: [number, number] | null,
  yMin?: number,
  yMax?: number,
): { domain: [number, number]; fixed: boolean } => {
  const [autoMin, autoMax] = extent
    ? extent[0] === extent[1]
      ? [extent[0] / 10, extent[1] * 10]
      : [extent[0] / 1.5, extent[1] * 1.5]
    : [1, 10];
  const min = yMin !== undefined && yMin > 0 ? yMin : autoMin;
  const max = yMax !== undefined && yMax > 0 ? yMax : autoMax;
  const userSet =
    (yMin !== undefined && yMin > 0) || (yMax !== undefined && yMax > 0);
  if (!userSet || min >= max) {
    return { domain: [autoMin, autoMax], fixed: false };
  }
  return { domain: [min, max], fixed: true };
};

/** Index of the bin containing `value`, for bin edges sorted ascending. */
export const binIndex = (edges: number[], value: number): number => {
  let index = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    if (edges[i] <= value) index = i;
  }
  return index;
};

/**
 * SVG path of a histogram: a flat segment across each bin, joined vertically
 * to the neighbouring bin. Bins that can't be drawn (e.g. zero on a log axis)
 * leave a gap, and every other bin is drawn even when isolated.
 */
export const stepPath = (
  edges: (number | null)[],
  counts: (number | null)[],
  x: (value: number) => number,
  y: (value: number) => number,
  isDrawable: (value: number | null) => value is number,
): string => {
  let path = "";
  let previousDrawn = false;
  for (let bin = 0; bin < edges.length - 1; bin++) {
    const value = counts[bin];
    const start = edges[bin];
    const end = edges[bin + 1];
    if (!isDrawable(value) || start === null || end === null) {
      previousDrawn = false;
      continue;
    }
    const top = y(value);
    path += `${previousDrawn ? "L" : "M"}${x(start)},${top}L${x(end)},${top}`;
    previousDrawn = true;
  }
  return path;
};
