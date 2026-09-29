import { schemeTableau10 } from "d3";

/** Line colors, in order, for the series of a 1D plot. */
export const seriesColor = (index: number) =>
  schemeTableau10[index % schemeTableau10.length];

/** Colormaps offered for 2D plots (matplotlib names). */
export const COLOR_MAPS = [
  "viridis",
  "plasma",
  "inferno",
  "magma",
  "cividis",
  "turbo",
  "coolwarm",
  "RdBu_r",
  "gray",
] as const;
