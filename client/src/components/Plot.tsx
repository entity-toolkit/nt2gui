import { TabNode } from "flexlayout-react";
import { useEffect, useMemo, useState } from "react";

import {
  IPlotters,
  PlotType,
  DataType,
  IPseudocolorConfig,
  defaultPseudocolorConfig,
  ITimeline,
} from "../global";

import PseudocolorControls from "./PseudocolorControls";
import { renderPseudocolor } from "../services/renderService";

interface IPlotProps {
  node: TabNode;
  plotters: IPlotters;
  timeline: ITimeline;
  activeSimulationId: string | null;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
}

const Plot = (props: IPlotProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  const node_datatype = node_plotter?.dataType;
  const node_plottype = node_plotter?.plotType;

  const isPseudocolor =
    node_datatype === DataType.Fields && node_plottype === PlotType.Pseudocolor;

  const pseudocolorConfig = useMemo(
    () => node_plotter?.pseudocolorConfig ?? defaultPseudocolorConfig,
    [node_plotter?.pseudocolorConfig],
  );

  const [imageSource, setImageSource] = useState<string | null>(null);
  const [renderedTime, setRenderedTime] = useState<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPseudocolor) {
      return;
    }

    if (!props.activeSimulationId) {
      setRenderError("Load a simulation to render pseudocolor plots.");
      setImageSource(null);
      return;
    }

    if (
      !pseudocolorConfig.field ||
      !pseudocolorConfig.xCoordinate ||
      !pseudocolorConfig.yCoordinate
    ) {
      setRenderError("Specify field and coordinate names to render the plot.");
      setImageSource(null);
      return;
    }

    setIsRendering(true);
    setRenderError(null);

    renderPseudocolor(props.activeSimulationId, pseudocolorConfig, props.timeline.current)
      .then((result) => {
        setImageSource(`data:image/png;base64,${result.image}`);
        setRenderedTime(result.timestamp);
      })
      .catch((error: Error) => {
        setImageSource(null);
        setRenderedTime(null);
        setRenderError(error.message ?? "Failed to render plot");
      })
      .finally(() => {
        setIsRendering(false);
      });
  }, [
    isPseudocolor,
    props.activeSimulationId,
    props.timeline.current,
    pseudocolorConfig,
  ]);

  return (
    <div className="plot">
      <div className="plot-header">
        <div className="plot-meta">
          <span className="badge">{node_datatype}</span>
          <span className="badge">{node_plottype}</span>
        </div>
      </div>
      <div className="plot-body">
        <div className="plot-figure">
          {!isPseudocolor ? (
            <div className="plot-figure__placeholder">
              <span className="plot-figure__tag">Pick a renderer</span>
              <div>Select a plot type to request a server render.</div>
            </div>
          ) : renderError ? (
            <div className="plot-figure__error" role="alert">
              {renderError}
            </div>
          ) : imageSource ? (
            <div className="plot-figure__preview">
              <img src={imageSource} alt="Pseudocolor render" />
              <div className="plot-figure__meta">
                <span className="plot-figure__tag">
                  t = {renderedTime?.toFixed(3) ?? props.timeline.current.toFixed(3)}
                </span>
                {isRendering && <span className="plot-figure__status">Refreshing…</span>}
              </div>
            </div>
          ) : (
            <div className="plot-figure__placeholder">
              <span className="plot-figure__tag">Awaiting render</span>
              <div>
                {isRendering
                  ? "Rendering pseudocolor preview…"
                  : "Adjust the controls to request a server-side render."}
              </div>
            </div>
          )}
        </div>
        <div className="plot-config">
          {isPseudocolor ? (
            <PseudocolorControls
              config={pseudocolorConfig}
              onChange={(config) =>
                props.onPseudocolorConfigChange(node_id, config)
              }
            />
          ) : (
            <div className="coming-soon">
              <div className="coming-soon__title">
                Plot configuration coming soon
              </div>
              <div className="coming-soon__subtitle">
                Backend-driven rendering will appear here once the plotting mode
                is enabled.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Plot;
