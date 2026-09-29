import {
  IParticleHistogramConfig,
  IParticleMetadata,
  IParticlePhaseConfig,
} from "../global";
import { useServerRender } from "../hooks/useServerRender";
import {
  histogramRequest,
  histogramToLines,
  phaseRequest,
  speciesLabel,
  withZoomWindow,
  uniqueLabels,
} from "../particleConfig";
import {
  renderParticleHistogram,
  renderParticlePhase,
} from "../services/particleService";
import LineChart from "./LineChart";
import ParticlePhaseChart from "./ParticlePhaseChart";
import plotStyles from "./Plot.module.css";
import styles from "./ParticleFigures.module.css";

const formatWeight = (weight: number) => Number(weight.toPrecision(3));

const Placeholder = ({ error }: { error: string | null }) =>
  error ? (
    <div className={plotStyles.figureError} role="alert">
      {error}
    </div>
  ) : (
    <div className={plotStyles.figurePlaceholder}>
      <span className={plotStyles.figureTag}>Binning particles…</span>
    </div>
  );

/** Particles left out because a log axis can't show values <= 0. */
const ExcludedNote = ({ weight }: { weight: number }) =>
  weight > 0 ? (
    <p className={styles.note}>
      Not shown on the log axis (value ≤ 0): weight {formatWeight(weight)}
    </p>
  ) : null;

interface HistogramFigureProps {
  simulationId: string;
  metadata: IParticleMetadata;
  config: IParticleHistogramConfig;
  time: number;
  zoomEnabled: boolean;
  onConfigChange: (config: IParticleHistogramConfig) => void;
}

/** Weighted 1D histograms sharing one binned x axis, one line per series. */
export const ParticleHistogramFigure = ({
  simulationId,
  metadata,
  config,
  time,
  zoomEnabled,
  onConfigChange,
}: HistogramFigureProps) => {
  const request = histogramRequest(config);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, request, time]),
    () => renderParticleHistogram(simulationId, request, time),
  );
  if (!data) return <Placeholder error={error} />;

  const labels = uniqueLabels(
    config.series.map((series) => speciesLabel(series.species, metadata)),
  );
  const excluded = data.series.reduce((sum, s) => sum + s.excludedWeight, 0);

  return (
    <div className={styles.figure}>
      {error && (
        <div className={plotStyles.figureError} role="alert">
          {error}
        </div>
      )}
      <LineChart
        data={histogramToLines(data, labels, config.x.quantity)}
        range={null}
        zoomEnabled={zoomEnabled}
        // Zooming re-bins the chosen range, so resolution follows the zoom.
        onRangeChange={(range) =>
          onConfigChange({ ...config, x: { ...config.x, ...range } })
        }
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

interface PhaseFigureProps {
  simulationId: string;
  config: IParticlePhaseConfig;
  time: number;
  zoomEnabled: boolean;
  onConfigChange: (config: IParticlePhaseConfig) => void;
}

/** Weighted 2D histogram (phase space) of the selected species. */
export const ParticlePhaseFigure = ({
  simulationId,
  config,
  time,
  zoomEnabled,
  onConfigChange,
}: PhaseFigureProps) => {
  const request = phaseRequest(config);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, request, time]),
    () => renderParticlePhase(simulationId, request, time),
  );
  if (!data) return <Placeholder error={error} />;

  return (
    <div className={styles.figure}>
      {error && (
        <div className={plotStyles.figureError} role="alert">
          {error}
        </div>
      )}
      <ParticlePhaseChart
        data={data}
        xAxis={config.x}
        yAxis={config.y}
        isRefreshing={isRendering}
        zoomEnabled={zoomEnabled}
        // Zooming re-bins the box, so resolution follows the zoom.
        onZoom={(window) => onConfigChange(withZoomWindow(config, window))}
      />
      <ExcludedNote weight={data.excludedWeight} />
    </div>
  );
};
