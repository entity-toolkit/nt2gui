import { useState } from "react";
import { formatNumber } from "../../lib/format";
import { useUi, useUiActions } from "../../state/UiContext";
import styles from "./TimelineBar.module.css";

/**
 * The global time slider. Dragging only moves the label; the time is applied
 * (and plots re-render) when the slider is released.
 */
const TimelineBar = () => {
  const { timeline } = useUi().uiState;
  const { setTimeline } = useUiActions();
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? timeline.current;

  const commit = () => {
    if (draft !== null && draft !== timeline.current) {
      setTimeline({ ...timeline, current: draft });
    }
    setDraft(null);
  };

  return (
    <footer className={styles.footer} aria-label="Global timeline">
      <input
        className={styles.slider}
        type="range"
        aria-label="Time"
        min={timeline.min}
        max={timeline.max}
        step={timeline.step}
        value={value}
        onChange={(event) => setDraft(Number(event.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
      />
      <div className={styles.labels}>
        <span>{formatNumber(timeline.min)}</span>
        <span className={styles.title}>Time: {formatNumber(value)}</span>
        <span>{formatNumber(timeline.max)}</span>
      </div>
    </footer>
  );
};

export default TimelineBar;
