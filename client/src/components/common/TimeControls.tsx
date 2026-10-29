import { ReactNode, useEffect, useEffectEvent, useId, useState } from "react";
import { formatNumber } from "../../lib/format";
import { isPlainKey, isTyping } from "../../lib/keyboard";
import { TbPlayerPauseFilled, TbPlayerPlayFilled } from "react-icons/tb";
import {
  HOLD_DELAY_MS,
  PLAYBACK_SPEEDS,
  indexOfTime,
  nextTime,
  stepCount,
  steppedTime,
  timeAtIndex,
} from "../../lib/playback";
import { ITimeline } from "../../state/schema";
import styles from "./TimeControls.module.css";

interface TimeControlsProps {
  /** Range, grid and current time. */
  timeline: ITimeline;
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
 * A time slider with playback. Dragging only moves the label; the time is
 * applied (and plots re-render) when the slider is released. Playback moves
 * to the next output once `waiting` clears, at most `fps` frames per second;
 * with `keyboard`, < and > step one output, and holding one repeats the same
 * way (after a short pause).
 */
const TimeControls = ({
  timeline,
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
      const next = nextTime({ current, min, max, step: gridStep });
      if (next === null) setPlaying(false);
      else step(next);
    }, 1000 / fps);
    return () => clearTimeout(timer);
  }, [current, fps, gridStep, max, min, playing, waiting]);

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
        );
        if (next === null) return setHeld(null);
        step(next);
        setHeld({ ...held, repeats: held.repeats + 1 });
      },
      held.repeats === 0 ? HOLD_DELAY_MS : 1000 / Math.max(fps, 5),
    );
    return () => clearTimeout(timer);
  }, [current, fps, gridStep, held, max, min, waiting]);

  const moveBy = (delta: number) => {
    const next = steppedTime(timeline, delta);
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
    if (!playing && nextTime(timeline) === null) onTimeChange(timeline.min);
    setPlaying((on) => !on);
  };

  const commit = () => {
    if (draft !== null && draft !== timeline.current) onTimeChange(draft);
    setDraft(null);
  };

  const timeLabel = (
    <span className={styles.title}>
      {label}: {formatNumber(value)}
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
          <input
            className={styles.slider}
            type="range"
            aria-label="Time"
            // Over grid indices: always a valid value, whatever the floats.
            min={0}
            max={stepCount(timeline)}
            step={1}
            value={indexOfTime(timeline, value)}
            aria-valuetext={formatNumber(value)}
            onChange={(event) => {
              setPlaying(false);
              setDraft(timeAtIndex(timeline, Number(event.target.value)));
            }}
            onMouseUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
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
