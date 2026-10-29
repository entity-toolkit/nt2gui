import { renderParticlePhase } from "../../api/particles";
import ImageChart, { ImageSelect } from "../../charts/ImageChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { useSimulationVersion } from "../../state/simulationData";
import { coordinateLabel } from "../../state/transforms";
import { useUi } from "../../state/UiContext";
import { ChartRegion, ChartSelection } from "../../state/regions";
import { IParticlePhaseConfig, IRegion, IZoomWindow } from "../../state/schema";
import { hasRange, phaseRequest } from "../particles/config";
import ExcludedNote from "../particles/ExcludedNote";
import styles from "../figure.module.css";

interface PhaseFigureProps {
  simulationId: string;
  config: IParticlePhaseConfig;
  time: number;
  zoomEnabled: boolean;
  onZoom: (window: IZoomWindow) => void;
  onPan: (window: IZoomWindow) => void;
  /** Every saved region (the config refers to them by name). */
  savedRegions: IRegion[];
  select: ImageSelect | null;
  onSelect: (selection: ChartSelection) => void;
  /** Saved regions to outline. */
  overlays: ChartRegion[];
}

/** Weighted 2D histogram (phase space) of the selected species. */
const PhaseFigure = ({
  simulationId,
  config,
  time,
  zoomEnabled,
  onZoom,
  onPan,
  savedRegions,
  select,
  onSelect,
  overlays,
}: PhaseFigureProps) => {
  const { uiState } = useUi();
  const request = phaseRequest(
    config,
    savedRegions,
    uiState.particleVariables,
    uiState.coordinateTransforms,
    uiState.timeAxis,
  );
  // Renders again when the simulation is reloaded from disk.
  const version = useSimulationVersion(simulationId);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, version, request, time]),
    (signal) => renderParticlePhase(simulationId, request, time, signal),
  );
  if (!data)
    return error ? (
      <FigureError>{error}</FigureError>
    ) : (
      <FigureMessage tag="Binning particles…" />
    );

  return (
    <div className={styles.figure}>
      {error && <FigureError>{error}</FigureError>}
      <ImageChart
        data={data}
        xAxis={{
          title: coordinateLabel(config.x.quantity),
          scale: config.x.scale,
          power: config.x.power,
        }}
        yAxis={{
          title: coordinateLabel(config.y.quantity),
          scale: config.y.scale,
          power: config.y.power,
        }}
        colorbarTitle="weighted count"
        preserveAspect={config.equalAspect ?? false}
        zoomEnabled={zoomEnabled}
        onZoom={onZoom}
        pan={
          hasRange(config.x) || hasRange(config.y)
            ? { x: hasRange(config.x), y: hasRange(config.y) }
            : undefined
        }
        onPan={onPan}
        select={select ?? undefined}
        onSelect={onSelect}
        regions={overlays}
        isRefreshing={isRendering}
      />
      <ExcludedNote weight={data.excludedWeight} />
    </div>
  );
};

export default PhaseFigure;
