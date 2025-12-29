import { TabNode } from "flexlayout-react";
import PickPlotter from "./PickPlotter";
import PickDatatype from "./PickDatatype";

import { IPlotters, PlotType, DataType } from "../global";

interface IPanelProps {
  node: TabNode;
  plotters: IPlotters;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
}

const Panel = (props: IPanelProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  return (
    <div className="panel">
      {node_plotter?.dataType === DataType.None ? (
        <PickDatatype {...props} />
      ) : (
        <PickPlotter {...props} />
      )}
    </div>
  );
};

export default Panel;
