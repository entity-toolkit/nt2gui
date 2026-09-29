import { TabNode } from "flexlayout-react";
import { DataType, IPlotters, PlotType } from "../global";
import SelectionMenu from "./SelectionMenu";

interface IPickPlotterProps {
  node: TabNode;
  plotters: IPlotters;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
}

const PickPlotter = (props: IPickPlotterProps) => {
  const node_id = props.node.getId();
  if (props.plotters[node_id]?.dataType === DataType.Particles) {
    return (
      <SelectionMenu
        options={[
          {
            label: "1D histogram",
            onSelect: () => props.onPlotTypeChange(node_id, PlotType.Line),
          },
          {
            label: "2D histogram (phase space)",
            onSelect: () =>
              props.onPlotTypeChange(node_id, PlotType.Pseudocolor),
          },
        ]}
        helperText="Weighted by particle weights; pick species and axes by right-clicking the plot."
      />
    );
  }
  return (
    <SelectionMenu
      options={[
        {
          label: "1D plot",
          onSelect: () => props.onPlotTypeChange(node_id, PlotType.Line),
        },
        {
          label: "2D pseudocolor",
          onSelect: () => props.onPlotTypeChange(node_id, PlotType.Pseudocolor),
        },
        { label: "2D scatter", disabled: true },
      ]}
      helperText="Additional plot types are coming soon."
    />
  );
};

export default PickPlotter;
