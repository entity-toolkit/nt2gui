import { TabNode } from "flexlayout-react";
import PickPlotter from "./PickPlotter";
import PickDatatype from "./PickDatatype";
import Plot from "./Plot";

import { IPlotters, PlotType, DataType, IPseudocolorConfig } from "../global";

interface IPanelProps {
  node: TabNode;
  plotters: IPlotters;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
}

const Panel = (props: IPanelProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  return (
    <div className="panel">
      {node_plotter?.dataType === DataType.None ? (
        <PickDatatype
          node={props.node}
          plotters={props.plotters}
          onDataTypeChange={props.onDataTypeChange}
        />
      ) : node_plotter?.plotType === PlotType.None ? (
        <PickPlotter
          node={props.node}
          plotters={props.plotters}
          onPlotTypeChange={props.onPlotTypeChange}
        />
      ) : (
        <Plot
          node={props.node}
          plotters={props.plotters}
          onDataTypeChange={props.onDataTypeChange}
          onPlotTypeChange={props.onPlotTypeChange}
          onPseudocolorConfigChange={props.onPseudocolorConfigChange}
        />
      )}
    </div>
  );
};

export default Panel;
