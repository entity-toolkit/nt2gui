import { IPlotter, ITimeline } from "../state/schema";

/** Frames per second offered for playback (the server accepts up to 60). */
export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 15, 20, 30, 60] as const;
export const DEFAULT_PLAYBACK_FPS = 2;

/** `min + index·step` without float noise (0.1·3 is 0.3, not 0.30000000000000004). */
const gridTime = (min: number, step: number, index: number) =>
  Number((min + index * step).toPrecision(12));

/**
 * Output times (ascending) the timeline steps through instead of its uniform
 * grid; outputs are rarely evenly spaced (restarts, several runs), and a
 * grid fine enough for the closest pair would step many times per output.
 * Null or empty: the grid `min + k·step`.
 */
export type OutputTimes = readonly number[] | null | undefined;

const hasOutputs = (outputs: OutputTimes): outputs is readonly number[] =>
  !!outputs && outputs.length > 0;

// Times this close to an output count as that output.
const closeTo = (outputs: readonly number[]) =>
  1e-9 * Math.max(Math.abs(outputs[outputs.length - 1] - outputs[0]), 1e-12);

/**
 * Index of the first output above `value` (or at/above it, with
 * `inclusive`); `outputs.length` when there is none. Outputs ascending.
 */
const firstAbove = (
  outputs: readonly number[],
  value: number,
  inclusive = false,
): number => {
  let low = 0;
  let high = outputs.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const above = inclusive
      ? outputs[middle] >= value
      : outputs[middle] > value;
    if (above) high = middle;
    else low = middle + 1;
  }
  return low;
};

/** Index of the output nearest to `time` (outputs ascending, non-empty). */
export const nearestOutputIndex = (
  outputs: readonly number[],
  time: number,
): number => {
  // The first output at or after `time`; the one before may be nearer.
  const after = Math.min(firstAbove(outputs, time, true), outputs.length - 1);
  return after > 0 && time - outputs[after - 1] <= outputs[after] - time
    ? after - 1
    : after;
};

/** The output nearest to `time`, or `time` itself without outputs. */
export const nearestOutput = (outputs: OutputTimes, time: number): number =>
  hasOutputs(outputs) ? outputs[nearestOutputIndex(outputs, time)] : time;

/**
 * Every simulation's output times as one ascending list; times closer than
 * a relative 1e-9 (the same output of runs sharing a time grid) count once.
 */
export const mergeOutputTimes = (lists: readonly number[][]): number[] => {
  const all = lists
    .flat()
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!all.length) return [];
  const tolerance = closeTo(all);
  return all.filter((time, i) => i === 0 || time - all[i - 1] > tolerance);
};

/**
 * The time one step after `timeline.current`: the next output, or on the
 * timeline's grid of `min + k·step`; null once the end is reached.
 */
export const nextTime = (
  timeline: ITimeline,
  outputs?: OutputTimes,
): number | null => {
  if (hasOutputs(outputs)) return steppedTime(timeline, 1, outputs);
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
 * Whether `time` lies before the first or after the last output of a
 * simulation spanning `span` (the global timeline can cover longer runs);
 * null inside it. Rounding of the timeline's grid isn't counted.
 */
export const outsideSpan = (
  time: number,
  span: { min: number; max: number },
): "before" | "after" | null => {
  const tolerance = 1e-6 * Math.max(Math.abs(span.max - span.min), 1e-12);
  if (time < span.min - tolerance) return "before";
  if (time > span.max + tolerance) return "after";
  return null;
};

/**
 * Number of steps on the timeline: between outputs, or on its grid `min,
 * min + step, …, max` (the last one may be shorter). The slider moves over
 * indices 0…count, so its value is always valid (no browser "select a valid
 * value" hints from float grids).
 */
export const stepCount = (
  { min, max, step }: ITimeline,
  outputs?: OutputTimes,
): number => {
  if (hasOutputs(outputs)) return outputs.length - 1;
  return step > 0 && max > min ? Math.ceil((max - min) / step - 1e-6) : 0;
};

/** The time at index `index` (the last index is the last output, or `max`). */
export const timeAtIndex = (
  timeline: ITimeline,
  index: number,
  outputs?: OutputTimes,
): number => {
  if (hasOutputs(outputs)) {
    return outputs[Math.min(Math.max(index, 0), outputs.length - 1)];
  }
  const count = stepCount(timeline);
  if (index >= count) return count ? timeline.max : timeline.min;
  return gridTime(timeline.min, timeline.step, Math.max(0, index));
};

/** The index of the output (or grid point) nearest to `time`. */
export const indexOfTime = (
  timeline: ITimeline,
  time: number,
  outputs?: OutputTimes,
): number => {
  if (hasOutputs(outputs)) return nearestOutputIndex(outputs, time);
  const count = stepCount(timeline);
  if (!count) return 0;
  if (time >= timeline.max - timeline.step * 1e-6) return count;
  const index = Math.round((time - timeline.min) / timeline.step);
  return Math.min(Math.max(index, 0), count - 1);
};

/**
 * The time `delta` steps from the current one (-1: previous, 1: next), or
 * null when that's past either end. With outputs, the first step goes to
 * the next output after (or last before) the current time, even when that
 * lies between outputs.
 */
export const steppedTime = (
  timeline: ITimeline,
  delta: number,
  outputs?: OutputTimes,
): number | null => {
  if (hasOutputs(outputs)) {
    if (delta === 0) return nearestOutput(outputs, timeline.current);
    const tolerance = closeTo(outputs);
    const current = timeline.current;
    // The first output past the current time in that direction.
    const first =
      delta > 0
        ? firstAbove(outputs, current + tolerance)
        : firstAbove(outputs, current - tolerance, true) - 1;
    const index = first + delta - Math.sign(delta);
    return index >= 0 && index < outputs.length ? outputs[index] : null;
  }
  const index = indexOfTime(timeline, timeline.current) + delta;
  if (index < 0 || index > stepCount(timeline)) return null;
  return timeAtIndex(timeline, index);
};

/** Holding a step button: the first repeat waits a little longer. */
export const HOLD_DELAY_MS = 350;
