import { renderPseudocolor } from "../../api/fields";
import { IFieldMetadata } from "../../api/types";
import ImageChart from "../../charts/ImageChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { IPseudocolorConfig, IZoomWindow } from "../../state/schema";
import { withSlice } from "../fields/metadata";
import SlicedFigure from "../fields/SlicedFigure";
import { pseudocolorSliceDims } from "./config";

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
}: PseudocolorFigureProps) => {
  const { expressions: _expressions, ...request } = config;
  const { data, error, isRendering } = useServerRender(
    config.field
      ? JSON.stringify([simulationId, request, time, viewport])
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
    />
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
