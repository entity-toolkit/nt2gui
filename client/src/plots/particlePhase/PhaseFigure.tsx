import { renderParticlePhase } from "../../api/particles";
import ImageChart from "../../charts/ImageChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { IParticlePhaseConfig, IZoomWindow } from "../../state/schema";
import { phaseRequest } from "../particles/config";
import ExcludedNote from "../particles/ExcludedNote";
import styles from "../particles/figure.module.css";

interface PhaseFigureProps {
  simulationId: string;
  config: IParticlePhaseConfig;
  time: number;
  zoomEnabled: boolean;
  onZoom: (window: IZoomWindow) => void;
}

/** Weighted 2D histogram (phase space) of the selected species. */
const PhaseFigure = ({
  simulationId,
  config,
  time,
  zoomEnabled,
  onZoom,
}: PhaseFigureProps) => {
  const request = phaseRequest(config);
  const { data, error, isRendering } = useServerRender(
    JSON.stringify([simulationId, request, time]),
    () => renderParticlePhase(simulationId, request, time),
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
          title: config.x.quantity,
          scale: config.x.scale,
          power: config.x.power,
        }}
        yAxis={{
          title: config.y.quantity,
          scale: config.y.scale,
          power: config.y.power,
        }}
        colorbarTitle="weighted count"
        zoomEnabled={zoomEnabled}
        onZoom={onZoom}
        isRefreshing={isRendering}
      />
      <ExcludedNote weight={data.excludedWeight} />
    </div>
  );
};

export default PhaseFigure;
