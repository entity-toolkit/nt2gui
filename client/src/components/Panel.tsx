import { TabNode } from "flexlayout-react";
import PickPlotter from "./PickPlotter";
import PickDatatype from "./PickDatatype";
import Plot from "./Plot";
import styles from "./Panel.module.css";

import {
  IPlotters,
  PlotType,
  DataType,
  IPseudocolorConfig,
  ITimeline,
  ISimulation,
} from "../global";

interface IPanelProps {
  node: TabNode;
  plotters: IPlotters;
  timeline: ITimeline;
  simulations: ISimulation[];
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
  onPlotSimulationChange: (node_id: string, simulationId?: string) => void;
}

const Panel = (props: IPanelProps) => {
  const node_id = props.node.getId();
  const node_plotter = props.plotters[node_id];
  return (
    <div className={styles.panel}>
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
          timeline={props.timeline}
          simulations={props.simulations}
          onDataTypeChange={props.onDataTypeChange}
          onPlotTypeChange={props.onPlotTypeChange}
          onPseudocolorConfigChange={props.onPseudocolorConfigChange}
          onPlotSimulationChange={props.onPlotSimulationChange}
        />
      )}
    </div>
  );
};

export default Panel;
