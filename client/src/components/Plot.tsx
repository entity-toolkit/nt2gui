import { TabNode } from "flexlayout-react";

import {
  IPlotters,
  PlotType,
  DataType,
  IPseudocolorConfig,
  defaultPseudocolorConfig,
} from "../global";

import PseudocolorControls from "./PseudocolorControls";

interface IPlotProps {
  node: TabNode;
  plotters: IPlotters;
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

  const pseudocolorConfig =
    node_plotter?.pseudocolorConfig ?? defaultPseudocolorConfig;

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
          <div className="plot-figure__placeholder">
            <span className="plot-figure__tag">Awaiting render</span>
            <div>Backend rendering will drop the image preview here.</div>
          </div>
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
