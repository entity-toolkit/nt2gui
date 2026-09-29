import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { IParticlePhaseConfig } from "../../state/schema";
import { useUiActions } from "../../state/UiContext";
import {
  defaultParticlePhaseConfig,
  hasRange,
  withoutRange,
  withZoomWindow,
} from "../particles/config";
import { useParticleMetadata } from "../particles/useParticleMetadata";
import PlotFrame from "../PlotFrame";
import { PlotKindProps } from "../types";
import PhaseControls from "./PhaseControls";
import PhaseFigure from "./PhaseFigure";

const ParticlePhasePlot = ({
  nodeId,
  plotter,
  simulationId,
  time,
}: PlotKindProps) => {
  const { updatePlotter } = useUiActions();
  const config = plotter.particlePhaseConfig ?? defaultParticlePhaseConfig;
  const { metadata, error } = useParticleMetadata(simulationId);
  const setConfig = (particlePhaseConfig: IParticlePhaseConfig) =>
    updatePlotter(nodeId, { particlePhaseConfig });

  return (
    <PlotFrame
      nodeId={nodeId}
      plotter={plotter}
      label="2D particle histogram"
      // Zooming re-bins the box, so resolution follows the zoom.
      zoom={{
        canZoom: true,
        isZoomed: hasRange(config.x) || hasRange(config.y),
        reset: () =>
          setConfig({
            ...config,
            x: withoutRange(config.x),
            y: withoutRange(config.y),
          }),
      }}
      controls={
        simulationId && (
          <PhaseControls
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
          <PhaseFigure
            simulationId={simulationId}
            config={config}
            time={time}
            zoomEnabled={zoom.enabled}
            onZoom={(window) => {
              setConfig(withZoomWindow(config, window));
              zoom.done();
            }}
          />
        )
      }
    </PlotFrame>
  );
};

export default ParticlePhasePlot;
