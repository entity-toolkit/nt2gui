import { IPlotter, ITimeline } from "../state/schema";

/** Frames per second offered for playback (the server accepts up to 60). */
export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 15, 20, 30, 60] as const;
export const DEFAULT_PLAYBACK_FPS = 2;

/**
 * The time one step after `timeline.current`, on the timeline's grid of
 * `min + k·step`, or null once the end is reached.
 */
export const nextTime = (timeline: ITimeline): number | null => {
  const { current, min, max, step } = timeline;
  if (!(step > 0) || current >= max) return null;
  const index = Math.round((current - min) / step) + 1;
  const next = min + index * step;
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
