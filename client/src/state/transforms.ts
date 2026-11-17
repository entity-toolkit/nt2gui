/**
 * Session-wide coordinate transforms (`x -> (x - grid.extent[0]) / 20`,
 * `t -> t * setup.omega`). A transform adds a primed coordinate next to the
 * original (`x` -> `xp`, shown as x′), so plots can use either; the timeline
 * runs in `t` or `tp` (`timeAxis`). Which coordinates can be transformed,
 * names and labels, what a request sends, and what changes in the state when
 * transforms change. Pure.
 */
import {
  IParticleAxis,
  IPlotter,
  ITimeline,
  IUiState,
  TimeAxis,
} from "./schema";

/** Matches `TRANSFORMABLE` in nt2gui/session/schema.py. */
export const TRANSFORMABLE = ["x", "y", "z", "r", "th", "ph", "t"];
export const TIME = "t";
export const PRIMED_TIME = "tp";
export type Transforms = Record<string, string>;

/** The coordinate a transform adds: x -> xp (matches `PRIMED` on the server). */
export const primed = (name: string) => `${name}p`;

const BASES = new Map(TRANSFORMABLE.map((name) => [primed(name), name]));

/** The original coordinate a (possibly primed) coordinate lives on. */
export const baseOf = (name: string) => BASES.get(name) ?? name;

export const isPrimed = (name: string) => BASES.has(name);

/** How a coordinate is shown: xp -> x′, others as they are. */
export const coordinateLabel = (name: string) =>
  isPrimed(name) ? `${baseOf(name)}′` : name;

/**
 * Each of `dims` followed by its transformed coordinate, for those that
 * have one in `available` (e.g. a field metadata's coords).
 */
export const withPrimed = (dims: string[], available: string[]) =>
  dims.flatMap((dim) =>
    available.includes(primed(dim)) ? [dim, primed(dim)] : [dim],
  );

const NAME_TOKEN = /[A-Za-z_][A-Za-z0-9_.]*/g;

/** Only the non-empty transforms, trimmed (what the state keeps). */
export const cleanTransforms = (transforms: Transforms): Transforms =>
  Object.fromEntries(
    Object.entries(transforms)
      .map(([name, expression]): [string, string] => [name, expression.trim()])
      .filter(
        ([name, expression]) => expression && TRANSFORMABLE.includes(name),
      ),
  );

/** Whether a spatial transform depends on time (a moving frame). */
export const isMovingFrame = (transforms: Transforms | undefined) =>
  Object.entries(transforms ?? {}).some(
    ([name, expression]) =>
      name !== TIME &&
      (expression.match(NAME_TOKEN) ?? ([] as string[])).includes(TIME),
  );

/**
 * The frame a field-metadata request needs: the transforms and, only for a
 * moving frame (whose coordinates change with time), the time.
 */
export const metadataFrame = (
  transforms: Transforms | undefined,
  time: number | undefined,
  timeAxis: TimeAxis = TIME,
): { transforms: Transforms; time?: number; timeAxis?: TimeAxis } | null => {
  if (!transforms || !Object.keys(transforms).length) return null;
  return isMovingFrame(transforms) && time !== undefined
    ? { transforms, time, ...(timeAxis !== TIME && { timeAxis }) }
    : { transforms };
};

const same = (a: Transforms, b: Transforms, keep: (name: string) => boolean) =>
  TRANSFORMABLE.filter(keep).every(
    (name) => (a[name] ?? "") === (b[name] ?? ""),
  );

const unzoomed = (plotter: IPlotter): IPlotter => ({
  ...plotter,
  ...(plotter.localViewport !== undefined && { localViewport: null }),
  ...(plotter.lineViewport !== undefined && { lineViewport: null }),
});

/** `smoothing` without the windows along `names` (empty: unset). */
const withoutWindows = (
  smoothing: Record<string, number> | undefined,
  names: string[],
) => {
  if (!smoothing || !names.some((name) => name in smoothing)) return smoothing;
  const rest = Object.fromEntries(
    Object.entries(smoothing).filter(([name]) => !names.includes(name)),
  );
  return Object.keys(rest).length ? rest : undefined;
};

/** A particle axis on a removed primed coordinate, back on the original. */
const unprimedAxis = (
  axis: IParticleAxis,
  removed: string[],
): IParticleAxis => {
  if (!removed.includes(axis.quantity)) return axis;
  const { min: _min, max: _max, ...rest } = axis;
  return { ...rest, quantity: baseOf(axis.quantity) };
};

/**
 * A plot that used coordinates whose transform is gone (`removed`: the
 * primed names, e.g. `xp`), back on the originals (`x`). Ranges and
 * smoothing windows along them were in the transformed units, so they go
 * (zooms are reset anyway). Expressions are left as they are.
 */
export const withoutPrimed = (
  plotter: IPlotter,
  removed: string[],
): IPlotter => {
  if (!removed.length) return plotter;
  const gone = (name: string) => removed.includes(name);
  // A removed primed name back to its original; others as they are.
  const restored = (name: string) => (gone(name) ? baseOf(name) : name);
  const next = { ...plotter };
  const line = plotter.lineConfig;
  if (
    line &&
    (gone(line.axis) || removed.some((n) => n in (line.smoothing ?? {})))
  ) {
    const { smoothing: _smoothing, ...rest } = line;
    const smoothing = withoutWindows(line.smoothing, removed);
    next.lineConfig = {
      ...rest,
      axis: restored(line.axis),
      ...(smoothing && { smoothing }),
    };
  }
  const image = plotter.pseudocolorConfig;
  if (
    image &&
    (gone(image.xCoordinate) ||
      gone(image.yCoordinate) ||
      removed.some((n) => n in (image.smoothing ?? {})))
  ) {
    const { smoothing: _smoothing, ...rest } = image;
    const smoothing = withoutWindows(image.smoothing, removed);
    next.pseudocolorConfig = {
      ...rest,
      xCoordinate: restored(image.xCoordinate),
      yCoordinate: restored(image.yCoordinate),
      ...(smoothing && { smoothing }),
    };
  }
  const histogram = plotter.particleHistogramConfig;
  if (histogram && gone(histogram.x.quantity)) {
    next.particleHistogramConfig = {
      ...histogram,
      x: unprimedAxis(histogram.x, removed),
    };
  }
  const phase = plotter.particlePhaseConfig;
  if (phase && (gone(phase.x.quantity) || gone(phase.y.quantity))) {
    next.particlePhaseConfig = {
      ...phase,
      x: unprimedAxis(phase.x, removed),
      y: unprimedAxis(phase.y, removed),
    };
  }
  return next.lineConfig === line &&
    next.pseudocolorConfig === image &&
    next.particleHistogramConfig === histogram &&
    next.particlePhaseConfig === phase
    ? plotter
    : next;
};

/**
 * The time axis the timeline should use with `transforms`: t′ only while
 * time is transformed.
 */
export const timeAxisFor = (
  transforms: Transforms,
  axis: TimeAxis | undefined,
): TimeAxis => (axis === PRIMED_TIME && transforms[TIME] ? PRIMED_TIME : TIME);

/**
 * Whether going from `previous` to `next` transforms (and time axes) moves
 * the timeline's values, so it must be fetched again (`fetchTimeline`).
 */
export const timelineMoves = (
  previous: Transforms | undefined,
  previousAxis: TimeAxis | undefined,
  next: Transforms,
  nextAxis: TimeAxis,
) => {
  const before = timeAxisFor(previous ?? {}, previousAxis);
  if (before !== nextAxis) return true;
  return nextAxis === PRIMED_TIME && timeChanged(previous, next);
};

/**
 * The state with new transforms (and time axis). Zooms may be on primed
 * coordinates, so they are reset when a spatial transform changes; plots on
 * a primed coordinate whose transform is removed go back to the original
 * (`withoutPrimed`);
 * `timeline` (from the server, see `api/simulations.ts:fetchTimeline`)
 * replaces the timeline when its values move (`timelineMoves`).
 */
export const withTransforms = (
  state: IUiState,
  transforms: Transforms,
  timeline?: ITimeline,
  timeAxis?: TimeAxis,
): IUiState => {
  const previous = state.coordinateTransforms ?? {};
  const next = cleanTransforms(transforms);
  const spatialSame = same(previous, next, (name) => name !== TIME);
  const removed = Object.keys(previous)
    .filter((name) => name !== TIME && !(name in next))
    .map(primed);
  return {
    ...state,
    coordinateTransforms: next,
    timeAxis: timeAxisFor(next, timeAxis ?? state.timeAxis),
    ...(timeline && { timeline }),
    ...(!spatialSame && {
      globalViewport: null,
      globalLineViewports: {},
      plotters: Object.fromEntries(
        Object.entries(state.plotters).map(([id, plotter]) => [
          id,
          unzoomed(withoutPrimed(plotter, removed)),
        ]),
      ),
    }),
  };
};

/** Whether time's transform differs between two sets. */
export const timeChanged = (a: Transforms | undefined, b: Transforms) =>
  (a?.[TIME] ?? "") !== (cleanTransforms(b)[TIME] ?? "");
