import { ITimeline } from "../global";
import TimelineControls from "./TimelineControls";
import styles from "./FooterBar.module.css";

interface FooterBarProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
}

const FooterBar = ({ timeline, onTimelineChange }: FooterBarProps) => (
  <footer className={styles.footer} aria-label="Global timeline">
    <TimelineControls timeline={timeline} onTimelineChange={onTimelineChange} />
  </footer>
);

export default FooterBar;
