import { TabNode } from "flexlayout-react";

import { IPlotters, PlotType, DataType } from "../global";

interface IPlotProps {
  node: TabNode;
  plotters: IPlotters;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
}

const Plot = (props: IPlotProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  const node_datatype = node_plotter?.dataType;
  const node_plottype = node_plotter?.plotType;
  return (
    <div className="plot">
      <h3>Plot Type: {node_datatype}</h3>
      <h3>Data Type: {node_plottype}</h3>
    </div>
  );
};

export default Plot;
