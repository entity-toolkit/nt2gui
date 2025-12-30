import { TabNode } from "flexlayout-react";
import { IPlotters, PlotType } from "../global";

interface IPickPlotterProps {
  node: TabNode;
  plotters: IPlotters;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
}

const PickPlotter = (props: IPickPlotterProps) => {
  const node_id = props.node.getId();
  return (
    <div className="add-plot-menu">
      <input
        type="button"
        value="1D plot"
        disabled
      />
      <input
        type="button"
        value="2D pseudocolor"
        onClick={() => props.onPlotTypeChange(node_id, PlotType.Pseudocolor)}
      />
      <input
        type="button"
        value="2D scatter"
        disabled
      />
      <small className="helper-text">Additional plot types are coming soon.</small>
    </div>
  );
};

export default PickPlotter;
