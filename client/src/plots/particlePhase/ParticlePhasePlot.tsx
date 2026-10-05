import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { isSpatial, regionsOnAxes, regionsShown } from "../../state/regions";
import { IParticlePhaseConfig } from "../../state/schema";
import { useUiActions } from "../../state/UiContext";
import {
  defaultParticlePhaseConfig,
  hasRange,
  withoutRange,
  withPanWindow,
  withZoomWindow,
} from "../particles/config";
import { useParticleMetadata } from "../particles/useParticleMetadata";
import PlotFrame, { imageSelect } from "../PlotFrame";
import { useRegions } from "../useRegions";
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
  const regions = useRegions();
  const showRegions = regionsShown(plotter, true);
  const axes = { x: config.x.quantity, y: config.y.quantity };
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
      select={imageSelect(axes)}
      showRegions={imageSelect(axes) ? showRegions : undefined}
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
            onPan={(window) => setConfig(withPanWindow(config, window))}
            savedRegions={regions.regions}
            select={
              zoom.select && {
                shape: zoom.select,
                x: isSpatial(axes.x),
                y: isSpatial(axes.y),
              }
            }
            onSelect={(selection) => {
              regions.save(selection, axes);
              zoom.done();
            }}
            overlays={
              showRegions ? regionsOnAxes(regions.regions, axes.x, axes.y) : []
            }
          />
        )
      }
    </PlotFrame>
  );
};

export default ParticlePhasePlot;
