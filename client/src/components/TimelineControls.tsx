import React from "react";
import { ITimeline } from "../global";

interface TimelineControlsProps {
  timeline: ITimeline;
  onTimelineChange: (timeline: ITimeline) => void;
}

const formatLabel = (value: number) => `${value.toFixed(2)}`;

const TimelineControls: React.FC<TimelineControlsProps> = ({
  timeline,
  onTimelineChange,
}) => {
  const [draftValue, setDraftValue] = React.useState<number>(timeline.current);

  React.useEffect(() => {
    setDraftValue(timeline.current);
  }, [timeline.current]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    setDraftValue(nextValue);
  };

  const commitTimeline = () => {
    if (draftValue === timeline.current) return;

    onTimelineChange({ ...timeline, current: draftValue });
  };

  const handleKeyUp = () => {
    commitTimeline();
  };

  return (
    <div className="timeline-controls" aria-label="Global timeline">
      <input
        className="timeline-slider"
        type="range"
        min={timeline.min}
        max={timeline.max}
        step={timeline.step}
        value={draftValue}
        onChange={handleChange}
        onMouseUp={commitTimeline}
        onTouchEnd={commitTimeline}
        onKeyUp={handleKeyUp}
      />
      <div className="timeline-range">
        <span>{formatLabel(timeline.min)}</span>
        <div className="timeline-labels">
          <span className="timeline-title">
            Time: {formatLabel(draftValue)}
          </span>
        </div>
        <span>{formatLabel(timeline.max)}</span>
      </div>
    </div>
  );
};

export default TimelineControls;
