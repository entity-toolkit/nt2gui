import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { isSpatial, regionsOnAxes, regionsShown } from "../../state/regions";
import { IPseudocolorConfig, IZoomWindow } from "../../state/schema";
import { useUi, useUiActions } from "../../state/UiContext";
import { useFieldMetadata } from "../fields/useFieldMetadata";
import PlotFrame, { imageSelect } from "../PlotFrame";
import { useRegions } from "../useRegions";
import { PlotKindProps } from "../types";
import {
  activeViewport,
  defaultPseudocolorConfig,
  withViewport,
} from "./config";
import PseudocolorControls from "./PseudocolorControls";
import PseudocolorFigure from "./PseudocolorFigure";

const FieldPseudocolorPlot = ({
  nodeId,
  plotter,
  simulationId,
  time,
}: PlotKindProps) => {
  const { uiState } = useUi();
  const { updatePlotter, updateUiState } = useUiActions();
  const regions = useRegions();
  const showRegions = regionsShown(plotter, true);
  const config = plotter.pseudocolorConfig ?? defaultPseudocolorConfig;
  const axes = { x: config.xCoordinate, y: config.yCoordinate };
  const { metadata, error, expressionErrors } = useFieldMetadata(
    simulationId,
    config.expressions,
    time,
  );

  const viewport = activeViewport(plotter, uiState.globalViewport);
  const setConfig = (pseudocolorConfig: IPseudocolorConfig) =>
    updatePlotter(nodeId, { pseudocolorConfig });
  const setViewport = (next: IZoomWindow | null) =>
    updateUiState((state) => withViewport(state, nodeId, next));

  return (
    <PlotFrame
      nodeId={nodeId}
      plotter={plotter}
      zoom={{
        canZoom: !!config.field,
        isZoomed: !!viewport,
        reset: () => setViewport(null),
        sync: { label: "" },
      }}
      select={imageSelect(axes)}
      showRegions={imageSelect(axes) ? showRegions : undefined}
      controls={
        simulationId && (
          <PseudocolorControls
            simulationId={simulationId}
            metadata={metadata}
            metadataError={error}
            expressionErrors={expressionErrors}
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
          <FigureMessage tag="Loading fields…" />
        ) : (
          <PseudocolorFigure
            nodeId={nodeId}
            simulationId={simulationId}
            metadata={metadata}
            config={config}
            time={time}
            viewport={viewport}
            zoomEnabled={zoom.enabled}
            onZoom={(next) => {
              setViewport(next);
              zoom.done();
            }}
            onConfigChange={setConfig}
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
            regions={
              showRegions ? regionsOnAxes(regions.regions, axes.x, axes.y) : []
            }
          />
        )
      }
    </PlotFrame>
  );
};

export default FieldPseudocolorPlot;
