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
  IZoomWindow,
  ITooltipDatum,
} from "../global";

interface IPanelProps {
  node: TabNode;
  plotters: IPlotters;
  timeline: ITimeline;
  simulations: ISimulation[];
  globalViewport: IZoomWindow | null;
  onDataTypeChange: (node_id: string, newDataType: DataType) => void;
  onPlotTypeChange: (node_id: string, newPlotType: PlotType) => void;
  onPseudocolorConfigChange: (
    node_id: string,
    config: IPseudocolorConfig,
  ) => void;
  onPlotSimulationChange: (node_id: string, simulationId?: string) => void;
  onGlobalViewportChange: (viewport: IZoomWindow | null) => void;
  onLocalViewportChange: (nodeId: string, viewport: IZoomWindow | null) => void;
  onSyncViewportToggle: (nodeId: string, useGlobal: boolean) => void;
  globalTooltip: ITooltipDatum | null;
  onGlobalTooltipChange: (tooltip: ITooltipDatum | null) => void;
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
          globalViewport={props.globalViewport}
          onGlobalViewportChange={props.onGlobalViewportChange}
          onLocalViewportChange={props.onLocalViewportChange}
          onSyncViewportToggle={props.onSyncViewportToggle}
          globalTooltip={props.globalTooltip}
          onGlobalTooltipChange={props.onGlobalTooltipChange}
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
