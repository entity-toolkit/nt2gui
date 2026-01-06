import { ITimeline } from "../global";
import TimelineControls from "./TimelineControls";

interface FooterBarProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
}

const FooterBar = ({ timeline, onTimelineChange }: FooterBarProps) => {
  return (
    <footer className="footer-bar" aria-label="Timeline and simulations">
      <section
        className="footer__section footer__timeline"
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
