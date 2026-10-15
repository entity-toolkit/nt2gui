import { IPlotter, ITimeline } from "../state/schema";

/** Frames per second offered for playback (the server accepts up to 60). */
export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 15, 20, 30, 60] as const;
export const DEFAULT_PLAYBACK_FPS = 2;

/** `min + index·step` without float noise (0.1·3 is 0.3, not 0.30000000000000004). */
const gridTime = (min: number, step: number, index: number) =>
  Number((min + index * step).toPrecision(12));

/**
 * The time one step after `timeline.current`, on the timeline's grid of
 * `min + k·step`, or null once the end is reached.
 */
export const nextTime = (timeline: ITimeline): number | null => {
  const { current, min, max, step } = timeline;
  if (!(step > 0) || current >= max) return null;
  const index = Math.round((current - min) / step) + 1;
  const next = gridTime(min, step, index);
  // Land exactly on max rather than overshooting by float error.
  return next >= max - step * 1e-6 ? max : next;
};

/** Whether a panel follows the global timeline (the default). */
export const isTimeSynced = (plotter: IPlotter | undefined) =>
  plotter?.syncTime ?? true;

/**
 * The time a panel shows: the global one, or its own (kept within the
 * timeline's range, which changes when another simulation is loaded).
 */
export const panelTime = (
  plotter: IPlotter | undefined,
  timeline: ITimeline,
): number => {
  if (isTimeSynced(plotter) || plotter?.localTime === undefined) {
    return timeline.current;
  }
  return Math.min(timeline.max, Math.max(timeline.min, plotter.localTime));
};

/**
 * Number of steps on the timeline's grid `min, min + step, …, max` (the last
 * one may be shorter). The slider moves over indices 0…count, so its value is
 * always valid (no browser "select a valid value" hints from float grids).
 */
export const stepCount = ({ min, max, step }: ITimeline): number =>
  step > 0 && max > min ? Math.ceil((max - min) / step - 1e-6) : 0;

/** The time at grid index `index` (the last index is `max`). */
export const timeAtIndex = (timeline: ITimeline, index: number): number => {
  const count = stepCount(timeline);
  if (index >= count) return count ? timeline.max : timeline.min;
  return gridTime(timeline.min, timeline.step, Math.max(0, index));
};

/** The grid index nearest to `time`. */
export const indexOfTime = (timeline: ITimeline, time: number): number => {
  const count = stepCount(timeline);
  if (!count) return 0;
  if (time >= timeline.max - timeline.step * 1e-6) return count;
  const index = Math.round((time - timeline.min) / timeline.step);
  return Math.min(Math.max(index, 0), count - 1);
};

/**
 * The grid time `delta` steps from the current one (-1: previous, 1: next),
 * or null when that's past either end.
 */
export const steppedTime = (
  timeline: ITimeline,
  delta: number,
): number | null => {
  const index = indexOfTime(timeline, timeline.current) + delta;
  if (index < 0 || index > stepCount(timeline)) return null;
  return timeAtIndex(timeline, index);
};

/** Holding a step button: the first repeat waits a little longer. */
export const HOLD_DELAY_MS = 350;
