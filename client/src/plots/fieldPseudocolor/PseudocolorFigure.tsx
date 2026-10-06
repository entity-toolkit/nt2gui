import { renderPseudocolor } from "../../api/fields";
import { IFieldMetadata } from "../../api/types";
import ImageChart, { ImageSelect } from "../../charts/ImageChart";
import { valueBounds } from "../../charts/scales";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { useSimulationVersion } from "../../state/simulationData";
import { ChartRegion, ChartSelection } from "../../state/regions";
import { IPseudocolorConfig, IZoomWindow } from "../../state/schema";
import { withSlice } from "../fields/metadata";
import SlicedFigure from "../fields/SlicedFigure";
import figureStyles from "../figure.module.css";
import { pseudocolorSliceDims } from "./config";

/** Says when the image averages blocks of cells (large slices). */
const SamplingNote = ({ sampling }: { sampling?: { x: number; y: number } }) =>
  sampling && (sampling.x > 1 || sampling.y > 1) ? (
    <p className={figureStyles.note}>
      Each pixel averages {sampling.x}×{sampling.y} cells — zoom in for full
      resolution
    </p>
  ) : null;

/** Plots of fields share a crosshair: their axes are the same coordinates. */
const CROSSHAIR_GROUP = "fields";

interface PseudocolorFigureProps {
  nodeId: string;
  simulationId: string;
  metadata: IFieldMetadata;
  config: IPseudocolorConfig;
  time: number;
  viewport: IZoomWindow | null;
  zoomEnabled: boolean;
  onZoom: (viewport: IZoomWindow) => void;
  onConfigChange: (config: IPseudocolorConfig) => void;
  select: ImageSelect | null;
  onSelect: (selection: ChartSelection) => void;
  regions: ChartRegion[];
}

/** One field over two coordinates, with sliders for any further dims. */
const PseudocolorFigure = ({
  nodeId,
  simulationId,
  metadata,
  config,
  time,
  viewport,
  zoomEnabled,
  onZoom,
  onConfigChange,
  select,
  onSelect,
  regions,
}: PseudocolorFigureProps) => {
  const { expressions: _expressions, ...request } = config;
  // Renders again when the simulation is reloaded from disk.
  const version = useSimulationVersion(simulationId);
  const { data, error, isRendering } = useServerRender(
    config.field
      ? JSON.stringify([simulationId, version, request, time, viewport])
      : null,
    (signal) =>
      renderPseudocolor(simulationId, request, time, viewport, signal),
  );

  const figure = !config.field ? (
    <FigureMessage tag="Nothing selected">
      Right-click the plot to choose a field.
    </FigureMessage>
  ) : error ? (
    <FigureError>{error}</FigureError>
  ) : data ? (
    <div className={figureStyles.figure}>
      <ImageChart
        data={data}
        xAxis={{ title: config.xCoordinate }}
        yAxis={{ title: config.yCoordinate }}
        colorbarTitle={config.field}
        preserveAspect
        zoomEnabled={zoomEnabled}
        onZoom={onZoom}
        isRefreshing={isRendering}
        crosshair={{ plotId: nodeId, group: CROSSHAIR_GROUP }}
        pan={
          viewport
            ? {
                x: true,
                y: true,
                bounds: {
                  x: valueBounds(metadata.coords[config.xCoordinate]),
                  y: valueBounds(metadata.coords[config.yCoordinate]),
                },
              }
            : undefined
        }
        onPan={onZoom}
        select={select ?? undefined}
        onSelect={onSelect}
        regions={regions}
      />
      <SamplingNote sampling={data.sampling} />
    </div>
  ) : (
    <FigureMessage tag="Rendering…" />
  );

  return (
    <SlicedFigure
      sliceDims={pseudocolorSliceDims(metadata, config)}
      coords={metadata.coords}
      slices={config.slices ?? {}}
      usedSlices={data?.slices}
      onSliceChange={(dim, value) =>
        onConfigChange(withSlice(config, dim, value))
      }
    >
      {figure}
    </SlicedFigure>
  );
};

export default PseudocolorFigure;
