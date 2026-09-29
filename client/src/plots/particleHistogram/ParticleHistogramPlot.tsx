import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { IParticleHistogramConfig } from "../../state/schema";
import { useUiActions } from "../../state/UiContext";
import {
  defaultParticleHistogramConfig,
  hasRange,
  withoutRange,
} from "../particles/config";
import { useParticleMetadata } from "../particles/useParticleMetadata";
import PlotFrame from "../PlotFrame";
import { PlotKindProps } from "../types";
import HistogramControls from "./HistogramControls";
import HistogramFigure from "./HistogramFigure";

const ParticleHistogramPlot = ({
  nodeId,
  plotter,
  simulationId,
  time,
}: PlotKindProps) => {
  const { updatePlotter } = useUiActions();
  const config =
    plotter.particleHistogramConfig ?? defaultParticleHistogramConfig;
  const { metadata, error } = useParticleMetadata(simulationId);
  const setConfig = (particleHistogramConfig: IParticleHistogramConfig) =>
    updatePlotter(nodeId, { particleHistogramConfig });

  return (
    <PlotFrame
      nodeId={nodeId}
      plotter={plotter}
      label="1D particle histogram"
      // Zooming narrows the binned range, so resolution follows the zoom.
      zoom={{
        canZoom: true,
        isZoomed: hasRange(config.x),
        reset: () => setConfig({ ...config, x: withoutRange(config.x) }),
      }}
      controls={
        simulationId && (
          <HistogramControls
            simulationId={simulationId}
            metadata={metadata}
            metadataError={error}
            config={config}
            onChange={setConfig}
          />
        )
      }
    >
      {(zoom) =>
        error ? (
          <FigureError>{error}</FigureError>
        ) : !metadata || !simulationId ? (
          <FigureMessage tag="Loading particles…" />
        ) : (
          <HistogramFigure
            simulationId={simulationId}
            metadata={metadata}
            config={config}
            time={time}
            zoomEnabled={zoom.enabled}
            onZoom={(range) => {
              setConfig({ ...config, x: { ...config.x, ...range } });
              zoom.done();
            }}
          />
        )
      }
    </PlotFrame>
  );
};

export default ParticleHistogramPlot;
