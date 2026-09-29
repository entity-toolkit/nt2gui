import { useMemo } from "react";
import { IFieldMetadata, ILineConfig, IRange } from "../global";
import { useLineRender } from "../hooks/useLineRender";
import {
  effectiveAxis,
  lineRequest,
  quantityDims,
  sliceDims,
  withSlice,
} from "../lineConfig";
import LineChart from "./LineChart";
import SlicedFigure from "./SlicedFigure";
import plotStyles from "./Plot.module.css";

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
  const requestConfig = useMemo(
    () => ({ ...lineRequest(config), axis }),
    [axis, config],
  );
  const { data, error, isRendering } = useLineRender(
    simulationId,
    requestConfig,
    time,
    range,
  );

  const figure = !config.quantities.length ? (
    <div className={plotStyles.figurePlaceholder}>
      <span className={plotStyles.figureTag}>Nothing selected</span>
      <div>Right-click the plot to choose quantities.</div>
    </div>
  ) : error ? (
    <div className={plotStyles.figureError} role="alert">
      {error}
    </div>
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
    <div className={plotStyles.figurePlaceholder}>
      <span className={plotStyles.figureTag}>Rendering…</span>
    </div>
  );

  return (
    <SlicedFigure
      sliceDims={sliceDims(dims, axis)}
      coords={metadata.coords}
      slices={config.slices}
      usedSlices={data?.slices}
      onSliceChange={(dim, value) => onConfigChange(withSlice(config, dim, value))}
    >
      {figure}
    </SlicedFigure>
  );
};

export default LineFigure;
