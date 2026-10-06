import { panelTime } from "../lib/playback";
import { RenderScope } from "../state/renderActivity";
import { DataType, PlotType } from "../state/schema";
import { useUi, useUiActions } from "../state/UiContext";
import { useFieldMetadata } from "./fields/useFieldMetadata";
import PlotPicker from "./PlotPicker";
import { findPlotKind } from "./registry";
import styles from "./Panel.module.css";

/**
 * One layout tab: pick the data type, then the plot kind, then show the plot.
 */
const Panel = ({ nodeId }: { nodeId: string }) => {
  const { uiState, simulations } = useUi();
  const { setDataType, setPlotType } = useUiActions();
  const plotter = uiState.plotters[nodeId];

  const dataType = plotter?.dataType ?? DataType.None;
  const picking = !plotter || plotter.plotType === PlotType.None;
  // The simulation a new plot would show (see assignSimulations), so the
  // picker can rule out kinds its data can't make.
  const pickerSimulation =
    picking && dataType === DataType.Fields
      ? (plotter?.simulationId ?? simulations[0]?.id ?? null)
      : null;
  const { metadata: fieldMetadata } = useFieldMetadata(
    pickerSimulation,
    undefined,
  );

  const content = (() => {
    if (!plotter || picking) {
      return (
        <PlotPicker
          dataType={dataType}
          context={{ fieldMetadata }}
          onDataType={(next) => setDataType(nodeId, next)}
          onPlotKind={(kind) =>
            setPlotType(nodeId, kind.plotType, kind.defaults)
          }
        />
      );
    }
    const kind = findPlotKind(plotter.dataType, plotter.plotType);
    if (!kind)
      return (
        <div>
          Unsupported plot: {plotter.dataType} / {plotter.plotType}
        </div>
      );
    return (
      <kind.Plot
        key={kind.id}
        nodeId={nodeId}
        plotter={plotter}
        simulationId={plotter.simulationId ?? null}
        time={panelTime(plotter, uiState.timeline)}
      />
    );
  })();

  // Renders are tracked per panel, so playback waits only for the panels it drives.
  return (
    <RenderScope.Provider value={nodeId}>
      <div className={styles.panel}>{content}</div>
    </RenderScope.Provider>
  );
};

export default Panel;
