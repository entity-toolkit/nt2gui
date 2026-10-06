import { renderParticleHistogram } from "../../api/particles";
import { IParticleMetadata } from "../../api/types";
import LineChart from "../../charts/LineChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { useSimulationVersion } from "../../state/simulationData";
import { ChartRegion } from "../../state/regions";
import { IParticleHistogramConfig, IRange, IRegion } from "../../state/schema";
import {
  hasRange,
  histogramRequest,
  histogramToLines,
  seriesLabel,
  uniqueLabels,
} from "../particles/config";
import ExcludedNote from "../particles/ExcludedNote";
import styles from "../figure.module.css";

interface HistogramFigureProps {
  simulationId: string;
  metadata: IParticleMetadata;
  config: IParticleHistogramConfig;
  time: number;
  zoomEnabled: boolean;
  onZoom: (range: IRange) => void;
  /** Every saved region (lines refer to them by name). */
  savedRegions: IRegion[];
  selectEnabled: boolean;
  onSelect: (range: IRange) => void;
  /** Saved regions to outline on the x axis. */
  overlays: ChartRegion[];
}

/** Weighted 1D histograms sharing one binned x axis, one line per series. */
const HistogramFigure = ({
  simulationId,
  metadata,
  config,
  time,
  zoomEnabled,
  onZoom,
  savedRegions,
  selectEnabled,
  onSelect,
  overlays,
}: HistogramFigureProps) => {
  const request = histogramRequest(config, savedRegions);
  // Renders again when the simulation is reloaded from disk.
  const version = useSimulationVersion(simulationId);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, version, request, time]),
    (signal) => renderParticleHistogram(simulationId, request, time, signal),
  );
  if (!data)
    return error ? (
      <FigureError>{error}</FigureError>
    ) : (
      <FigureMessage tag="Binning particles…" />
    );

  const labels = uniqueLabels(
    config.series.map((series) => seriesLabel(series, metadata, savedRegions)),
  );
  const excluded = data.series.reduce((sum, s) => sum + s.excludedWeight, 0);

  return (
    <div className={styles.figure}>
      {error && <FigureError>{error}</FigureError>}
      <LineChart
        data={histogramToLines(data, labels, config.x.quantity)}
        range={null}
        zoomEnabled={zoomEnabled}
        onRangeChange={onZoom}
        isRefreshing={isRendering}
        yMin={config.yMin}
        yMax={config.yMax}
        xScaleKind={config.x.scale}
        xPower={config.x.power}
        yScaleKind={config.yScale ?? "log"}
        step
        // Panning shifts the binned range (and re-bins), like a zoom.
        pan={hasRange(config.x) ? {} : undefined}
        onPan={onZoom}
        selectEnabled={selectEnabled}
        onSelect={onSelect}
        regions={overlays}
      />
      <ExcludedNote weight={excluded} />
    </div>
  );
};

export default HistogramFigure;
