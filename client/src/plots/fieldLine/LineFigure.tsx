import { renderLine } from "../../api/fields";
import { IFieldMetadata } from "../../api/types";
import LineChart from "../../charts/LineChart";
import {
  FigureError,
  FigureMessage,
} from "../../components/common/FigureMessage";
import { useServerRender } from "../../hooks/useServerRender";
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
}: LineFigureProps) => {
  const dims = quantityDims(metadata, config.quantities);
  const axis = effectiveAxis(config.axis, dims);
  const request = { ...lineRequest(config), axis };
  const { data, error, isRendering } = useServerRender(
    config.quantities.length && axis
      ? JSON.stringify([simulationId, request, time, range])
      : null,
    () => renderLine(simulationId, request, time, range),
  );

  const figure = !config.quantities.length ? (
    <FigureMessage tag="Nothing selected">
      Right-click the plot to choose quantities.
    </FigureMessage>
  ) : error ? (
    <FigureError>{error}</FigureError>
  ) : data ? (
    <LineChart
      data={data}
      range={range}
      zoomEnabled={zoomEnabled}
      onRangeChange={onRangeChange}
      isRefreshing={isRendering}
      yMin={config.yMin}
      yMax={config.yMax}
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
