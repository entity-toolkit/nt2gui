import { ReactNode, useEffect, useEffectEvent, useId, useState } from "react";
import { formatNumber } from "../../lib/format";
import { TbPlayerPauseFilled, TbPlayerPlayFilled } from "react-icons/tb";
import {
  PLAYBACK_SPEEDS,
  indexOfTime,
  nextTime,
  stepCount,
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
}

/**
 * A time slider with playback. Dragging only moves the label; the time is
 * applied (and plots re-render) when the slider is released. Playback moves
 * to the next output once `waiting` clears, at most `fps` frames per second.
 */
const TimeControls = ({
  timeline,
  onTimeChange,
  fps,
  onFpsChange,
  waiting,
  variant = "full",
  trailing,
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
    <span className={styles.title}>Time: {formatNumber(value)}</span>
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
          title={playing ? "Pause" : "Play through time"}
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
