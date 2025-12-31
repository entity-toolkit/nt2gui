import { ISimulation, ITimeline } from "../global";
import TimelineControls from "./TimelineControls";

const formatLabel = (value: number) => value.toFixed(2);

interface FooterBarProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
  simulations: ISimulation[];
  onUnloadSimulation: (id: string) => void;
  isLoading: boolean;
}

const FooterBar = ({
  timeline,
  onTimelineChange,
  simulations,
  onUnloadSimulation,
  isLoading,
}: FooterBarProps) => {
  return (
    <footer className="footer-bar" aria-label="Timeline and simulations">
      <section className="footer__section footer__timeline" aria-label="Global timeline">
        <div className="footer__section-header">
          <h2 className="footer__title">Timeline</h2>
          <span className="footer__status">Current: {formatLabel(timeline.current)}</span>
        </div>
        <TimelineControls timeline={timeline} onTimelineChange={onTimelineChange} />
      </section>
      <section className="footer__section footer__simulations" aria-live="polite">
        <div className="footer__section-header">
          <h2 className="footer__title">Loaded simulations</h2>
          {isLoading && <span className="footer__status">Loading…</span>}
        </div>
        {simulations.length === 0 ? (
          <p className="simulations__empty">No simulations loaded</p>
        ) : (
          <ul className="simulations__list">
            {simulations.map((simulation) => (
              <li key={simulation.id} className="simulations__item">
                <span className="simulations__path">{simulation.path}</span>
                <button
                  type="button"
                  className="simulations__unload"
                  onClick={() => onUnloadSimulation(simulation.id)}
                >
                  Unload
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </footer>
  );
};

export default FooterBar;
