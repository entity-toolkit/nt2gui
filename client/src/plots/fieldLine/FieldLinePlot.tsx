import { valueBounds } from "../../charts/scales";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { isSpatial, regionsOnAxes, regionsShown } from "../../state/regions";
import { ILineConfig, IRange } from "../../state/schema";
import { useUi, useUiActions } from "../../state/UiContext";
import { quantityDims } from "../fields/metadata";
import { useFieldMetadata } from "../fields/useFieldMetadata";
import PlotFrame from "../PlotFrame";
import { useRegions } from "../useRegions";
import { PlotKindProps } from "../types";
import {
  activeLineRange,
  defaultLineConfig,
  effectiveAxis,
  withLineRange,
} from "./config";
import LineControls from "./LineControls";
import LineFigure from "./LineFigure";

const FieldLinePlot = ({
  nodeId,
  plotter,
  simulationId,
  time,
}: PlotKindProps) => {
  const { uiState } = useUi();
  const { updatePlotter, updateUiState } = useUiActions();
  const regions = useRegions();
  const showRegions = regionsShown(plotter, false);
  const config = plotter.lineConfig ?? defaultLineConfig;
  const { metadata, error, expressionErrors } = useFieldMetadata(
    simulationId,
    config.expressions,
  );

  const axis = metadata
    ? effectiveAxis(config.axis, quantityDims(metadata, config.quantities))
    : "";
  const range = activeLineRange(plotter, uiState.globalLineViewports, axis);
  const setConfig = (lineConfig: ILineConfig) =>
    updatePlotter(nodeId, { lineConfig });
  const setRange = (next: IRange | null) =>
    axis && updateUiState((state) => withLineRange(state, nodeId, axis, next));

  return (
    <PlotFrame
      nodeId={nodeId}
      plotter={plotter}
      label="1D field cut"
      zoom={{
        canZoom: !!axis && config.quantities.length > 0,
        isZoomed: !!range,
        reset: () => setRange(null),
        // 1D plots only sync with other 1D plots along the same coordinate.
        sync: { label: axis },
      }}
      select={isSpatial(axis) ? {} : undefined}
      showRegions={isSpatial(axis) ? showRegions : undefined}
      controls={
        simulationId && (
          <LineControls
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
          <LineFigure
            simulationId={simulationId}
            metadata={metadata}
            config={config}
            time={time}
            range={range}
            zoomEnabled={zoom.enabled}
            onRangeChange={(next) => {
              setRange(next);
              zoom.done();
            }}
            onConfigChange={setConfig}
            panBounds={valueBounds(metadata.coords[axis])}
            onPan={setRange}
            selectEnabled={zoom.select !== null}
            onSelect={(selected) => {
              regions.save({ kind: "range", ...selected }, { x: axis });
              zoom.done();
            }}
            regions={showRegions ? regionsOnAxes(regions.regions, axis) : []}
          />
        )
      }
    </PlotFrame>
  );
};

export default FieldLinePlot;
