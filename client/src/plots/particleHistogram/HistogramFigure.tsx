import { renderParticleHistogram } from "../../api/particles";
import { IParticleMetadata } from "../../api/types";
import LineChart from "../../charts/LineChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { IParticleHistogramConfig, IRange } from "../../state/schema";
import {
  histogramRequest,
  histogramToLines,
  speciesLabel,
  uniqueLabels,
} from "../particles/config";
import ExcludedNote from "../particles/ExcludedNote";
import styles from "../particles/figure.module.css";

interface HistogramFigureProps {
  simulationId: string;
  metadata: IParticleMetadata;
  config: IParticleHistogramConfig;
  time: number;
  zoomEnabled: boolean;
  onZoom: (range: IRange) => void;
}

/** Weighted 1D histograms sharing one binned x axis, one line per series. */
const HistogramFigure = ({
  simulationId,
  metadata,
  config,
  time,
  zoomEnabled,
  onZoom,
}: HistogramFigureProps) => {
  const request = histogramRequest(config);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, request, time]),
    () => renderParticleHistogram(simulationId, request, time),
  );
  if (!data)
    return error ? (
      <FigureError>{error}</FigureError>
    ) : (
      <FigureMessage tag="Binning particles…" />
    );

  const labels = uniqueLabels(
    config.series.map((series) => speciesLabel(series.species, metadata)),
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
        yLog={(config.yScale ?? "log") === "log"}
        step
      />
      <ExcludedNote weight={excluded} />
    </div>
  );
};

export default HistogramFigure;
