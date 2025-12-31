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
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    onTimelineChange({ ...timeline, current: nextValue });
  };

  return (
    <div className="timeline-controls" aria-label="Global timeline">
      <input
        className="timeline-slider"
        type="range"
        min={timeline.min}
        max={timeline.max}
        step={timeline.step}
        value={timeline.current}
        onChange={handleChange}
      />
      <div className="timeline-range">
        <span>{formatLabel(timeline.min)}</span>
        <div className="timeline-labels">
          <span className="timeline-title">
            Time: {formatLabel(timeline.current)}
          </span>
        </div>
        <span>{formatLabel(timeline.max)}</span>
      </div>
    </div>
  );
};

export default TimelineControls;
