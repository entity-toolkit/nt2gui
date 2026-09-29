import { ITimeline } from "../global";
import { SyncStatus } from "../sync/StateSync";
import TimelineControls from "./TimelineControls";
import styles from "./FooterBar.module.css";

interface FooterBarProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
  syncStatus: SyncStatus;
  /** The timeline only means something once a simulation is loaded. */
  showTimeline: boolean;
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  synced: "Saved",
  saving: "Saving…",
  offline: "Server unreachable — retrying",
  error: "Server rejected the last change",
};

const FooterBar = ({
  timeline,
  onTimelineChange,
  syncStatus,
  showTimeline,
}: FooterBarProps) => {
  return (
    <footer className={styles.footer} aria-label="Timeline and simulations">
      {showTimeline && (
        <section
          className={`${styles.section} ${styles.timelineSection}`}
          aria-label="Global timeline"
        >
          <TimelineControls
            timeline={timeline}
            onTimelineChange={onTimelineChange}
          />
        </section>
      )}
      <span
        className={`${styles.syncStatus} ${styles[syncStatus]}`}
        role="status"
      >
        {SYNC_LABELS[syncStatus]}
      </span>
    </footer>
  );
};

export default FooterBar;
