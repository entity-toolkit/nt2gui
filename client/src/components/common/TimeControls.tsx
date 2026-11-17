import { ReactNode, useEffect, useEffectEvent, useId, useState } from "react";
import { formatNumber } from "../../lib/format";
import { isPlainKey, isTyping } from "../../lib/keyboard";
import { TbPlayerPauseFilled, TbPlayerPlayFilled } from "react-icons/tb";
import {
  HOLD_DELAY_MS,
  OutputTimes,
  PLAYBACK_SPEEDS,
  indexOfTime,
  nearestOutput,
  nearestOutputIndex,
  nextTime,
  steppedTime,
  timeAtIndex,
} from "../../lib/playback";
import { ITimeline } from "../../state/schema";
import styles from "./TimeControls.module.css";
import TimeSlider from "./TimeSlider";

interface TimeControlsProps {
  /** Range, grid and current time. */
  timeline: ITimeline;
  /**
   * The output times to step through (slider, playback, keys); until they
   * load, the timeline's uniform grid.
   */
  outputs?: OutputTimes;
  onTimeChange: (time: number) => void;
  fps: number;
  onFpsChange: (fps: number) => void;
  /** Playback holds while this is true (plots still rendering the current time). */
  waiting: boolean;
  /**
   * full: slider with min/max/time labels below; compact: one row with the
   * time next to the slider; minimal: no slider (playback keeps running).
   */
  variant?: "full" | "compact" | "minimal";
  /** Extra controls at the end of the row. */
  trailing?: ReactNode;
  /** What the time is called (default "Time"), e.g. for transformed time. */
  label?: string;
  /**
   * Step with the < and > keys (also , and .) anywhere on the page outside
   * text inputs; holding one keeps stepping. For the one global timeline.
   */
  keyboard?: boolean;
}

/** -1 / 1 for a step key, or null (with modifiers, or not a step key). */
const stepKey = (event: KeyboardEvent): -1 | 1 | null => {
  if (!isPlainKey(event)) return null;
  if (event.key === "<" || event.key === ",") return -1;
  if (event.key === ">" || event.key === ".") return 1;
  return null;
};

/**
 * A time track with playback, moving output by output (`outputs`). The
 * track is uniform in time with a tick per output (`TimeSlider`); dragging
 * only moves the label, and the nearest output is applied (plots re-render)
 * when it is released. Playback moves to the next output once
 * `waiting` clears, at most `fps` frames per second;
 * with `keyboard`, < and > step one output, and holding one repeats the same
 * way (after a short pause).
 */
const TimeControls = ({
  timeline,
  outputs,
  onTimeChange,
  fps,
  onFpsChange,
  waiting,
  variant = "full",
  trailing,
  label = "Time",
  keyboard = false,
}: TimeControlsProps) => {
  const [draft, setDraft] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const speedId = useId();
  const value = draft ?? timeline.current;
  // Parents pass a new callback on every render; that mustn't restart the frame timer.
  const step = useEffectEvent(onTimeChange);

  const { current, min, max, step: gridStep } = timeline;
  useEffect(() => {
    if (!playing || waiting) return;
    const timer = setTimeout(() => {
      const next = nextTime({ current, min, max, step: gridStep }, outputs);
      if (next === null) setPlaying(false);
      else step(next);
    }, 1000 / fps);
    return () => clearTimeout(timer);
  }, [current, fps, gridStep, max, min, outputs, playing, waiting]);

  // A held step key: its direction, and how often it has repeated.
  const [held, setHeld] = useState<{ delta: number; repeats: number } | null>(
    null,
  );
  useEffect(() => {
    if (!held || waiting) return;
    const timer = setTimeout(
      () => {
        const next = steppedTime(
          { current, min, max, step: gridStep },
          held.delta,
          outputs,
        );
        if (next === null) return setHeld(null);
        step(next);
        setHeld({ ...held, repeats: held.repeats + 1 });
      },
      held.repeats === 0 ? HOLD_DELAY_MS : 1000 / Math.max(fps, 5),
    );
    return () => clearTimeout(timer);
  }, [current, fps, gridStep, held, max, min, outputs, waiting]);

  const moveBy = (delta: number) => {
    const next = steppedTime(timeline, delta, outputs);
    if (next === null) return;
    setPlaying(false);
    setDraft(null);
    onTimeChange(next);
  };

  const keyStep = useEffectEvent((event: KeyboardEvent) => {
    const delta = stepKey(event);
    if (delta === null || isTyping(event.target)) return;
    event.preventDefault();
    // The key's own auto-repeat is ignored: holding steps at playback pace.
    if (event.repeat) return;
    moveBy(delta);
    setHeld({ delta, repeats: 0 });
  });

  useEffect(() => {
    if (!keyboard) return;
    const release = () => setHeld(null);
    const onKeyUp = (event: KeyboardEvent) => {
      if (stepKey(event) !== null || event.key === "Shift") release();
    };
    window.addEventListener("keydown", keyStep);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", keyStep);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [keyboard]);

  const togglePlay = () => {
    // At the end: start over.
    if (!playing && nextTime(timeline, outputs) === null) {
      onTimeChange(timeAtIndex(timeline, 0, outputs));
    }
    setPlaying((on) => !on);
  };

  // A picked time goes to the nearest output (or, until outputs load, grid
  // point): what the plots will show.
  const snap = (time: number) =>
    outputs?.length
      ? nearestOutput(outputs, time)
      : timeAtIndex(timeline, indexOfTime(timeline, time));

  // Which output, of how many (full variant).
  const position =
    variant === "full" && outputs?.length
      ? `${nearestOutputIndex(outputs, value) + 1} / ${outputs.length}`
      : null;
  const timeLabel = (
    <span className={styles.title}>
      {label}: {formatNumber(value)}
      {position && (
        <span className={styles.position} title="Output, of the marked ones">
          {" "}
          · output {position}
        </span>
      )}
    </span>
  );
  // Keep a saved speed that isn't one of the presets selectable.
  const speeds = PLAYBACK_SPEEDS.includes(fps as never)
    ? PLAYBACK_SPEEDS
    : [...PLAYBACK_SPEEDS, fps].sort((a, b) => a - b);

  return (
    <div className={styles.controls} data-variant={variant}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.play}
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          title={
            playing
              ? "Pause"
              : keyboard
                ? "Play through time (< and > step)"
                : "Play through time"
          }
        >
          {playing ? (
            <TbPlayerPauseFilled aria-hidden />
          ) : (
            <TbPlayerPlayFilled aria-hidden />
          )}
        </button>
        {variant !== "minimal" && (
          <TimeSlider
            min={timeline.min}
            max={timeline.max}
            value={value}
            outputs={outputs}
            snap={snap}
            onDrag={(time) => {
              setPlaying(false);
              setDraft(time);
            }}
            onCommit={(time) => {
              setPlaying(false);
              setDraft(null);
              if (time !== timeline.current) onTimeChange(time);
            }}
            onStep={moveBy}
            format={formatNumber}
            label={label}
          />
        )}
        {variant !== "full" && timeLabel}
        <label className={styles.speed} htmlFor={speedId}>
          <select
            id={speedId}
            value={fps}
            onChange={(event) => onFpsChange(Number(event.target.value))}
            aria-label="Playback speed"
            title="Target fps"
          >
            {speeds.map((option) => (
              <option key={option} value={option}>
                {option} fps
              </option>
            ))}
          </select>
        </label>
        {trailing}
      </div>
      {variant === "full" && (
        <div className={styles.labels}>
          <span>{formatNumber(timeline.min)}</span>
          {timeLabel}
          <span>{formatNumber(timeline.max)}</span>
        </div>
      )}
    </div>
  );
};

export default TimeControls;
