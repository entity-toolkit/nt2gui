import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { IPseudocolorConfig, IZoomWindow } from "../../state/schema";
import { useUi, useUiActions } from "../../state/UiContext";
import { useFieldMetadata } from "../fields/useFieldMetadata";
import PlotFrame from "../PlotFrame";
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
  const config = plotter.pseudocolorConfig ?? defaultPseudocolorConfig;
  const { metadata, error, expressionErrors } = useFieldMetadata(
    simulationId,
    config.expressions,
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
      label="2D field"
      zoom={{
        canZoom: !!config.field,
        isZoomed: !!viewport,
        reset: () => setViewport(null),
        sync: { label: "" },
      }}
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
          />
        )
      }
    </PlotFrame>
  );
};

export default FieldPseudocolorPlot;
