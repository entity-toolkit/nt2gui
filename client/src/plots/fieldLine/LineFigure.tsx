import { renderLine } from "../../api/fields";
import { IFieldMetadata } from "../../api/types";
import LineChart from "../../charts/LineChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
import { useSimulationVersion } from "../../state/simulationData";
import { ChartRegion } from "../../state/regions";
import { ILineConfig, IRange } from "../../state/schema";
import { quantityDims, withSlice } from "../fields/metadata";
import SlicedFigure from "../fields/SlicedFigure";
import { effectiveAxis, lineRequest, sliceDims } from "./config";

interface LineFigureProps {
  simulationId: string;
  metadata: IFieldMetadata;
  config: ILineConfig;
  time: number;
  range: IRange | null;
  zoomEnabled: boolean;
  onRangeChange: (range: IRange) => void;
  onConfigChange: (config: ILineConfig) => void;
  /** Range the view can be panned within; panning is off when undefined. */
  panBounds?: [number, number];
  onPan: (range: IRange) => void;
  selectEnabled: boolean;
  onSelect: (range: IRange) => void;
  regions: ChartRegion[];
}

/** A 1D cut through the selected fields, with sliders for the sliced dims. */
const LineFigure = ({
  simulationId,
  metadata,
  config,
  time,
  range,
  zoomEnabled,
  onRangeChange,
  onConfigChange,
  panBounds,
  onPan,
  selectEnabled,
  onSelect,
  regions,
}: LineFigureProps) => {
  const dims = quantityDims(metadata, config.quantities);
  const axis = effectiveAxis(config.axis, dims);
  const request = { ...lineRequest(config), axis };
  // Renders again when the simulation is reloaded from disk.
  const version = useSimulationVersion(simulationId);
  const { data, error, isRendering } = useServerRender(
    config.quantities.length && axis
      ? JSON.stringify([simulationId, version, request, time, range])
      : null,
    (signal) => renderLine(simulationId, request, time, range, signal),
  );

  const figure = !config.quantities.length ? (
    <FigureMessage tag="Nothing selected">
      Right-click the plot to choose quantities.
    </FigureMessage>
  ) : error ? (
    <FigureError>{error}</FigureError>
  ) : data ? (
    <LineChart
      pan={range && panBounds ? { bounds: panBounds } : undefined}
      onPan={onPan}
      selectEnabled={selectEnabled}
      onSelect={onSelect}
      regions={regions}
      data={data}
      range={range}
      zoomEnabled={zoomEnabled}
      onRangeChange={onRangeChange}
      isRefreshing={isRendering}
      yMin={config.yMin}
      yMax={config.yMax}
      yScaleKind={config.yScale}
      yPower={config.yPower}
    />
  ) : (
    <FigureMessage tag="Rendering…" />
  );

  return (
    <SlicedFigure
      sliceDims={sliceDims(dims, axis)}
      coords={metadata.coords}
      slices={config.slices}
      usedSlices={data?.slices}
      onSliceChange={(dim, value) =>
        onConfigChange(withSlice(config, dim, value))
      }
    >
      {figure}
    </SlicedFigure>
  );
};

export default LineFigure;
