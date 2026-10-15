/**
 * Saved spatial regions (region-01, …): creating them from a selection on a
 * plot, removing them, and showing them on other plots. Pure functions.
 */
import { IPlotter, IRange, IRegion, IUiState } from "./schema";

/**
 * Coordinates that are positions, shared by fields and particles (cartesian
 * and spherical runs). Matches `POSITION_COLUMNS` in nt2gui/data/particles.py.
 */
const POSITIONS = ["x", "y", "z", "r", "th", "ph"];
// With their transformed versions (xp, …; see state/transforms.ts).
export const SPATIAL_COORDINATES = [
  ...POSITIONS,
  ...POSITIONS.map((name) => `${name}p`),
];

export const isSpatial = (name: string | null | undefined): name is string =>
  !!name && SPATIAL_COORDINATES.includes(name);

/** A selection drawn on a chart, in data units of its axes. */
export type ChartSelection =
  | { kind: "range"; min: number; max: number }
  | { kind: "box"; xMin: number; xMax: number; yMin: number; yMax: number }
  | { kind: "lasso"; points: [number, number][] };

/** A region as seen on one chart's axes; a missing side is unbounded. */
export interface ChartRegion {
  name: string;
  /** Outline color (see `regionColor`); charts fall back to a default. */
  color?: string;
  x?: [number, number];
  y?: [number, number];
  /** In the chart's (x, y) order. */
  polygon?: [number, number][];
}

const REGION_NAME = /^region-(\d+)$/;

/** Distinct colors for regions, chosen to stand out on the dark plots. */
export const REGION_COLORS = [
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#a3e635",
];

/**
 * The color a region named `name` starts with, from its number (region-03 →
 * the third color), so a region keeps its color when others are deleted.
 * Other names hash.
 */
export const colorForName = (name: string): string => {
  const match = REGION_NAME.exec(name);
  const index = match
    ? Number(match[1]) - 1
    : [...name].reduce((hash, char) => hash * 31 + char.charCodeAt(0), 0);
  const count = REGION_COLORS.length;
  return REGION_COLORS[((index % count) + count) % count];
};

/**
 * Whether a plot outlines the saved regions: its own choice, else shown on
 * 1D plots and hidden on 2D ones (where they would cover the image).
 */
export const regionsShown = (
  plotter: { showRegions?: boolean },
  is2d: boolean,
): boolean => plotter.showRegions ?? !is2d;

/** A region's color: the one it was saved with, else from its name. */
export const regionColor = (region: IRegion): string =>
  region.color ?? colorForName(region.name);

/** region-01, region-02, …: one past the highest number in use. */
export const nextRegionName = (regions: IRegion[]): string => {
  const used = regions.map((region) =>
    Number(REGION_NAME.exec(region.name)?.[1] ?? 0),
  );
  const next = Math.max(0, ...used) + 1;
  return `region-${String(next).padStart(2, "0")}`;
};

const ordered = (a: number, b: number): IRange => ({
  min: Math.min(a, b),
  max: Math.max(a, b),
});

/**
 * The region (without its name) a chart selection describes, given the
 * coordinates on the chart's axes; a non-spatial axis (null) is left
 * unconstrained. Null when nothing spatial was selected.
 */
export const selectionToRegion = (
  selection: ChartSelection,
  axes: { x: string | null; y?: string | null },
): Omit<IRegion, "name"> | null => {
  const x = isSpatial(axes.x) ? axes.x : null;
  const y = isSpatial(axes.y) ? axes.y : null;
  if (selection.kind === "range") {
    return x
      ? { ranges: { [x]: ordered(selection.min, selection.max) } }
      : null;
  }
  if (selection.kind === "box") {
    const ranges: Record<string, IRange> = {};
    if (x) ranges[x] = ordered(selection.xMin, selection.xMax);
    if (y) ranges[y] = ordered(selection.yMin, selection.yMax);
    return Object.keys(ranges).length ? { ranges } : null;
  }
  if (!x || !y || selection.points.length < 3) return null;
  return { polygon: { x, y, points: selection.points } };
};

/** The state with `region` saved under the next free name. */
export const withRegion = (
  state: IUiState,
  region: Omit<IRegion, "name">,
): IUiState => {
  const regions = state.regions ?? [];
  const name = nextRegionName(regions);
  return {
    ...state,
    regions: [...regions, { ...region, name, color: colorForName(name) }],
  };
};

/** Applies `update` to every particle plot's list of region names. */
const mapRegionReferences = (
  state: IUiState,
  update: (names: string[] | undefined) => string[] | undefined,
): IUiState["plotters"] =>
  Object.fromEntries(
    Object.entries(state.plotters).map(([id, plotter]): [string, IPlotter] => {
      const phase = plotter.particlePhaseConfig;
      const histogram = plotter.particleHistogramConfig;
      return [
        id,
        {
          ...plotter,
          ...(phase && {
            particlePhaseConfig: { ...phase, regions: update(phase.regions) },
          }),
          ...(histogram && {
            particleHistogramConfig: {
              ...histogram,
              series: histogram.series.map((series) => ({
                ...series,
                regions: update(series.regions),
              })),
            },
          }),
        },
      ];
    }),
  );

/** Removes a region and every particle plot's reference to it. */
export const withoutRegion = (state: IUiState, name: string): IUiState => ({
  ...state,
  plotters: mapRegionReferences(state, (names) =>
    names?.includes(name) ? names.filter((n) => n !== name) : names,
  ),
  regions: (state.regions ?? []).filter((region) => region.name !== name),
});

// Matches `Region.name` in nt2gui/session/schema.py.
export const MAX_REGION_NAME = 64;

/** Why `next` can't be the new name of region `name`, or null if it can. */
export const regionNameProblem = (
  regions: IRegion[] | undefined,
  name: string,
  next: string,
): string | null => {
  if (!next.trim()) return "A region name is required";
  if (next.trim().length > MAX_REGION_NAME) {
    return `Region names are at most ${MAX_REGION_NAME} characters`;
  }
  const taken = regions?.some(
    (region) => region.name === next.trim() && region.name !== name,
  );
  return taken ? `Another region is already called '${next.trim()}'` : null;
};

/**
 * Renames a region and every particle plot's reference to it. Its color is
 * kept (stored, if it was still derived from the old name). Invalid names
 * (see `regionNameProblem`) leave the state unchanged.
 */
export const withRenamedRegion = (
  state: IUiState,
  name: string,
  next: string,
): IUiState => {
  const target = next.trim();
  if (target === name || regionNameProblem(state.regions, name, target)) {
    return state;
  }
  return {
    ...state,
    plotters: mapRegionReferences(state, (names) =>
      names?.includes(name)
        ? names.map((n) => (n === name ? target : n))
        : names,
    ),
    regions: (state.regions ?? []).map((region) =>
      region.name === name
        ? { ...region, name: target, color: regionColor(region) }
        : region,
    ),
  };
};

/** The saved regions called `names` (unknown names are skipped). */
export const pickRegions = (
  names: string[] | undefined,
  regions: IRegion[] | undefined,
): IRegion[] =>
  (regions ?? []).filter((region) => names?.includes(region.name));

/** Only the names of regions that still exist. */
export const existingRegionNames = (
  names: string[] | undefined,
  regions: IRegion[] | undefined,
): string[] =>
  (names ?? []).filter((name) => regions?.some((r) => r.name === name));

const extentOf = (values: number[]): [number, number] => [
  Math.min(...values),
  Math.max(...values),
];

const intersect = (
  a: [number, number] | undefined,
  b: [number, number] | undefined,
): [number, number] | undefined =>
  !a ? b : !b ? a : [Math.max(a[0], b[0]), Math.min(a[1], b[1])];

/** A region's extent along one coordinate, if it constrains it. */
const extentAlong = (
  region: IRegion,
  name: string,
): [number, number] | undefined => {
  const range = region.ranges?.[name];
  const polygon = region.polygon;
  const fromPolygon =
    polygon && (polygon.x === name || polygon.y === name)
      ? extentOf(polygon.points.map((p) => (polygon.x === name ? p[0] : p[1])))
      : undefined;
  return intersect(range && [range.min, range.max], fromPolygon);
};

/**
 * How a region looks on a chart with coordinates `x` (and `y`) on its axes:
 * its polygon when it was drawn over the same coordinates, otherwise its
 * extent along each axis. Null when it constrains neither axis.
 */
export const regionOnAxes = (
  region: IRegion,
  x: string,
  y?: string,
): ChartRegion | null => {
  const polygon = region.polygon;
  if (polygon && y && !region.ranges) {
    if (polygon.x === x && polygon.y === y) {
      return { name: region.name, polygon: polygon.points };
    }
    if (polygon.x === y && polygon.y === x) {
      return {
        name: region.name,
        polygon: polygon.points.map(([a, b]) => [b, a]),
      };
    }
  }
  const xExtent = isSpatial(x) ? extentAlong(region, x) : undefined;
  const yExtent = isSpatial(y) ? extentAlong(region, y) : undefined;
  if (!xExtent && !yExtent) return null;
  return { name: region.name, x: xExtent, y: yExtent };
};

/** The regions visible on a chart's axes. */
export const regionsOnAxes = (
  regions: IRegion[] | undefined,
  x: string,
  y?: string,
): ChartRegion[] =>
  (regions ?? []).flatMap((region) => {
    const shape = regionOnAxes(region, x, y);
    return shape ? [{ ...shape, color: regionColor(region) }] : [];
  });

/** A one-line description, e.g. "x ∈ [0, 1], y ∈ [2, 3]" or "lasso in x–y". */
export const describeRegion = (
  region: IRegion,
  format: (value: number) => string,
): string => {
  const parts = Object.entries(region.ranges ?? {}).map(
    ([name, { min, max }]) => `${name} ∈ [${format(min)}, ${format(max)}]`,
  );
  if (region.polygon) {
    parts.push(
      `lasso in ${region.polygon.x}–${region.polygon.y} (${region.polygon.points.length} points)`,
    );
  }
  return parts.join(", ");
};

/**
 * Thins a drawn path (pixels): drops points closer than `minDistance` to
 * the last kept one, then keeps at most `maxPoints` evenly spaced points.
 */
export const simplifyPath = (
  points: [number, number][],
  minDistance = 3,
  maxPoints = 400,
): [number, number][] => {
  const kept: [number, number][] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (
      !last ||
      Math.hypot(point[0] - last[0], point[1] - last[1]) >= minDistance
    ) {
      kept.push(point);
    }
  }
  if (kept.length <= maxPoints) return kept;
  const stride = kept.length / maxPoints;
  return Array.from(
    { length: maxPoints },
    (_, i) => kept[Math.floor(i * stride)],
  );
};

/** Area of a polygon (shoelace), in its own units squared. */
export const polygonArea = (points: [number, number][]): number => {
  let twice = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    twice += x0 * y1 - x1 * y0;
  });
  return Math.abs(twice) / 2;
};
