import { ITimeline } from "../global";
import TimelineControls from "./TimelineControls";
import styles from "./FooterBar.module.css";

interface FooterBarProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
}

const FooterBar = ({ timeline, onTimelineChange }: FooterBarProps) => {
  return (
    <footer className={styles.footer} aria-label="Timeline and simulations">
      <section
        className={`${styles.section} ${styles.timelineSection}`}
        aria-label="Global timeline"
      >
        <TimelineControls
          timeline={timeline}
          onTimelineChange={onTimelineChange}
        />
      </section>
    </footer>
  );
};

export default FooterBar;
