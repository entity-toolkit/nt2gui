import { IGridSummary, ITimesSummary } from "./global";

/** Compact numbers: 3 significant digits, no trailing zeros ("0.354", "1e+03"). */
export const formatNumber = (value: number) => {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3)
    return value.toExponential(2).replace(/\.?0+e/, "e");
  return String(Number(value.toPrecision(3)));
};

export const formatCount = (value: number) => value.toLocaleString("en-US");

export const formatRange = (min: number, max: number) =>
  min === max
    ? formatNumber(min)
    : `${formatNumber(min)} – ${formatNumber(max)}`;

/** "28 outputs, t = 0.354 – 9.9" / "1 output, t = 2". */
export const formatTimes = (times: ITimesSummary | null) => {
  if (!times) return "no outputs";
  const outputs = `${times.count} output${times.count === 1 ? "" : "s"}`;
  return `${outputs}, t = ${formatRange(times.min, times.max)}`;
};

/** Grid resolution in dimension order, e.g. "32 × 64". */
export const formatResolution = (axes: IGridSummary["axes"]) =>
  axes.map((axis) => axis.size).join(" × ");

/** One entry per axis, e.g. "x ∈ 0.5 – 31.5 (32)". */
export const formatAxes = (axes: IGridSummary["axes"]) =>
  axes.map((axis) =>
    axis.min === undefined || axis.max === undefined
      ? `${axis.name} (${axis.size})`
      : `${axis.name} ∈ ${formatRange(axis.min, axis.max)} (${axis.size})`,
  );

export const formatMass = (mass: number | null) =>
  mass === null
    ? "mass unknown"
    : mass === 0
      ? "massless"
      : `m = ${formatNumber(mass)}`;
