import { useState } from "react";
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import { useTransforms } from "../../hooks/useTransforms";
import { PRIMED_TIME, TIME, coordinateLabel } from "../../state/transforms";
import TimeControls from "../common/TimeControls";
import { DEFAULT_PLAYBACK_FPS, isTimeSynced } from "../../lib/playback";
import { useRendersPending } from "../../state/renderActivity";
import { useUi, useUiActions } from "../../state/UiContext";
import styles from "./TimelineBar.module.css";

/**
 * The global time slider and playback, shared by every panel with "Sync time"
 * on. Playback waits only for those panels' renders. Collapsing it leaves the
 * play button and the current time.
 */
const TimelineBar = () => {
  const { uiState } = useUi();
  const { updateUiState } = useUiActions();
  const { timeline, plotters } = uiState;
  const collapsed = uiState.timelineCollapsed ?? false;
  const waiting = useRendersPending((scope) => isTimeSynced(plotters[scope]));
  const { transforms, timeAxis, setTimeAxis } = useTransforms();
  const [switching, setSwitching] = useState(false);
  // With time transformed, the timeline can run in either t or t′.
  const axisToggle = transforms[TIME] ? (
    <span className={styles.axes} role="group" aria-label="Timeline time">
      {([TIME, PRIMED_TIME] as const).map((axis) => (
        <button
          key={axis}
          type="button"
          aria-pressed={timeAxis === axis}
          disabled={switching}
          title={
            axis === TIME
              ? "The run's own time"
              : `Transformed time: t′ = ${transforms[TIME]}`
          }
          onClick={() => {
            if (axis === timeAxis) return;
            setSwitching(true);
            setTimeAxis(axis).finally(() => setSwitching(false));
          }}
        >
          {coordinateLabel(axis)}
        </button>
      ))}
    </span>
  ) : null;

  return (
    <footer
      className={styles.footer}
      data-collapsed={collapsed}
      aria-label="Global timeline"
    >
      <TimeControls
        timeline={timeline}
        onTimeChange={(current) =>
          updateUiState((prev) => ({
            ...prev,
            timeline: { ...prev.timeline, current },
          }))
        }
        fps={uiState.playbackFps ?? DEFAULT_PLAYBACK_FPS}
        onFpsChange={(playbackFps) =>
          updateUiState((prev) => ({ ...prev, playbackFps }))
        }
        waiting={waiting}
        variant={collapsed ? "minimal" : "full"}
        label={timeAxis === PRIMED_TIME ? "Time (t′)" : "Time"}
        trailing={
          <>
            {axisToggle}
            <button
              type="button"
              className={styles.collapse}
              onClick={() =>
                updateUiState((prev) => ({
                  ...prev,
                  timelineCollapsed: !collapsed,
                }))
              }
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
              title={collapsed ? "Expand timeline" : "Collapse timeline"}
            >
              {collapsed ? (
                <TbChevronUp aria-hidden />
              ) : (
                <TbChevronDown aria-hidden />
              )}
            </button>
          </>
        }
      />
    </footer>
  );
};

export default TimelineBar;
