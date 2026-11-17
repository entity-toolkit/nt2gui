import { KeyboardEvent, PointerEvent, useMemo, useRef, useState } from "react";
import {
  OutputTimes,
  TICK_SPACE,
  fractionTime,
  nearestOutputIndex,
  outputTicksPath,
  timeFraction,
} from "../../lib/playback";
import styles from "./TimeSlider.module.css";

interface TimeSliderProps {
  min: number;
  max: number;
  /** The time the thumb is at. */
  value: number;
  /** Output times, marked with ticks. */
  outputs: OutputTimes;
  /** The time a pointer position picks (the nearest output, or grid point). */
  snap: (time: number) => number;
  /** While dragging: the time under the pointer (snapped). */
  onDrag: (time: number) => void;
  /** On release, Home or End: the time to show. */
  onCommit: (time: number) => void;
  /** Arrow keys: one output (or grid step) back or forward. */
  onStep: (delta: -1 | 1) => void;
  format: (time: number) => string;
  label?: string;
}

/**
 * A time track uniform in time (gaps between outputs show as gaps), with a
 * tick at every output; the current output's tick is highlighted. Clicking
 * or dragging picks the output nearest the pointer, and hovering shows
 * which one that is.
 */
const TimeSlider = ({
  min,
  max,
  value,
  outputs,
  snap,
  onDrag,
  onCommit,
  onStep,
  format,
  label = "Time",
}: TimeSliderProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // The time the pointer would pick, while hovering.
  const [hover, setHover] = useState<number | null>(null);

  const ticks = useMemo(
    () => outputTicksPath(outputs, min, max),
    [max, min, outputs],
  );
  const position = (time: number) => `${timeFraction(time, min, max) * 100}%`;
  const current = outputs?.length ? nearestOutputIndex(outputs, value) : null;

  const timeAt = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    const fraction =
      box && box.width > 0 ? (clientX - box.left) / box.width : 0;
    // No usable position (some synthetic events): stay where it is.
    if (!Number.isFinite(fraction)) return value;
    return snap(fractionTime(fraction, min, max));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return;
    event.preventDefault();
    ref.current?.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    onDrag(timeAt(event.clientX));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const time = timeAt(event.clientX);
    setHover(time);
    if (dragging) onDrag(time);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    onCommit(timeAt(event.clientX));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => onStep(-1),
      ArrowDown: () => onStep(-1),
      ArrowRight: () => onStep(1),
      ArrowUp: () => onStep(1),
      Home: () => onCommit(snap(min)),
      End: () => onCommit(snap(max)),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const outputText =
    current !== null && outputs?.length
      ? `, output ${current + 1} of ${outputs.length}`
      : "";

  return (
    <div
      ref={ref}
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${format(value)}${outputText}`}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <svg
        className={styles.ticks}
        viewBox={`0 0 ${TICK_SPACE} 1`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={ticks} vectorEffect="non-scaling-stroke" />
        {current !== null && outputs && (
          <path
            className={styles.currentTick}
            d={outputTicksPath([outputs[current]], min, max)}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className={styles.track} aria-hidden>
        <div className={styles.fill} style={{ width: position(value) }} />
      </div>
      {hover !== null && !dragging && (
        <div
          className={styles.hover}
          style={{ left: position(hover) }}
          aria-hidden
        >
          <span className={styles.hoverLabel}>{format(hover)}</span>
        </div>
      )}
      <div
        className={styles.thumb}
        style={{ left: position(value) }}
        aria-hidden
      />
    </div>
  );
};

export default TimeSlider;
