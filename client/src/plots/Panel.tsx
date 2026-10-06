import SelectionMenu from "../components/common/SelectionMenu";
import { panelTime } from "../lib/playback";
import { RenderScope } from "../state/renderActivity";
import { DataType, PlotType } from "../state/schema";
import { useUi, useUiActions } from "../state/UiContext";
import { PLOT_KINDS, findPlotKind } from "./registry";
import styles from "./Panel.module.css";

/** Plot types that are planned but not available yet. */
const COMING_SOON: Partial<Record<DataType, string[]>> = {
  [DataType.Fields]: ["2D scatter"],
};

const DATA_TYPES = [
  { label: "fields", dataType: DataType.Fields },
  { label: "particles", dataType: DataType.Particles },
];

/**
 * One layout tab: pick the data type, then the plot kind, then show the plot.
 */
const Panel = ({ nodeId }: { nodeId: string }) => {
  const { uiState } = useUi();
  const { setDataType, setPlotType } = useUiActions();
  const plotter = uiState.plotters[nodeId];

  const content = (() => {
    if (!plotter || plotter.dataType === DataType.None) {
      return (
        <SelectionMenu
          options={DATA_TYPES.map(({ label, dataType }) => ({
            label,
            onSelect: () => setDataType(nodeId, dataType),
          }))}
        />
      );
    }
    if (plotter.plotType === PlotType.None) {
      return (
        <SelectionMenu
          options={[
            ...PLOT_KINDS.filter(
              (kind) => kind.dataType === plotter.dataType,
            ).map((kind) => ({
              label: kind.label,
              onSelect: () => setPlotType(nodeId, kind.plotType, kind.defaults),
            })),
            ...(COMING_SOON[plotter.dataType] ?? []).map((label) => ({
              label,
              disabled: true,
            })),
          ]}
          helperText="Right-click a plot to choose what it shows."
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
