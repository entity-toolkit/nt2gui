/**
 * Session-wide coordinate transforms (`x -> (x - grid.extent[0]) / 20`,
 * `t -> t * setup.omega`): which coordinates can be transformed, what a
 * request sends, and what changes in the state when they change. Pure.
 */
import { IPlotter, ITimeline, IUiState } from "./schema";

/** Matches `TRANSFORMABLE` in nt2gui/session/schema.py. */
export const TRANSFORMABLE = ["x", "y", "z", "r", "th", "ph", "t"];
export const TIME = "t";
export type Transforms = Record<string, string>;

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
): { transforms: Transforms; time?: number } | null => {
  if (!transforms || !Object.keys(transforms).length) return null;
  return isMovingFrame(transforms) && time !== undefined
    ? { transforms, time }
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

/**
 * The state with new transforms. Zooms are in the old coordinates, so they
 * are reset when a spatial transform changes; `timeline` (from the server,
 * see `api/simulations.ts:fetchTimeline`) replaces the timeline when time's
 * transform changes.
 */
export const withTransforms = (
  state: IUiState,
  transforms: Transforms,
  timeline?: ITimeline,
): IUiState => {
  const previous = state.coordinateTransforms ?? {};
  const next = cleanTransforms(transforms);
  const spatialSame = same(previous, next, (name) => name !== TIME);
  return {
    ...state,
    coordinateTransforms: next,
    ...(timeline && { timeline }),
    ...(!spatialSame && {
      globalViewport: null,
      globalLineViewports: {},
      plotters: Object.fromEntries(
        Object.entries(state.plotters).map(([id, plotter]) => [
          id,
          unzoomed(plotter),
        ]),
      ),
    }),
  };
};

/** Whether time's transform differs between two sets. */
export const timeChanged = (a: Transforms | undefined, b: Transforms) =>
  (a?.[TIME] ?? "") !== (cleanTransforms(b)[TIME] ?? "");
