import SelectionMenu from "../components/common/SelectionMenu";
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
        time={uiState.timeline.current}
      />
    );
  })();

  return <div className={styles.panel}>{content}</div>;
};

export default Panel;
