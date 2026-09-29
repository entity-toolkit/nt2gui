import {
  axisBottom,
  axisLeft,
  line,
  scaleLinear,
  schemeTableau10,
  select,
} from "d3";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { IRange } from "../global";
import { useElementSize } from "../hooks/useElementSize";
import { extentOf, nearestIndex, valueDomain } from "../lineConfig";
import { ILineRender } from "../services/fieldService";
import plotStyles from "./Plot.module.css";
import styles from "./LineChart.module.css";

interface LineChartProps {
  data: ILineRender;
  range: IRange | null;
  zoomEnabled: boolean;
  onRangeChange: (range: IRange) => void;
  isRefreshing: boolean;
  /** Fixed value-axis limits; unset sides are automatic. */
  yMin?: number;
  yMax?: number;
}

const margin = { top: 14, right: 18, bottom: 42, left: 64 };
const MIN_ZOOM_PX = 4;

export const seriesColor = (index: number) =>
  schemeTableau10[index % schemeTableau10.length];

const formatValue = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : value.toPrecision(4);

const styleAxis = (group: SVGGElement) => {
  const selection = select(group);
  selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
  selection.selectAll("line").attr("stroke", "#475569");
  selection.selectAll("path").attr("stroke", "#475569");
};

/**
 * Draws 1D series against one coordinate. The chart fills its container;
 * zooming only narrows the coordinate axis, and the value axis rescales to
 * whatever is visible.
 */
const LineChart = ({
  data,
  range,
  zoomEnabled,
  onRangeChange,
  isRefreshing,
  yMin,
  yMax,
}: LineChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const gridRef = useRef<SVGGElement | null>(null);
  const clipId = useId();
  const { width, height } = useElementSize(containerRef);
  const innerWidth = Math.max(width - margin.left - margin.right, 0);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 0);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ start: number; current: number } | null>(
    null,
  );

  const xScale = useMemo(() => {
    const domain = range
      ? [range.min, range.max]
      : (extentOf(data.coordinates) ?? [0, 1]);
    return scaleLinear()
      .domain(domain)
      .range([margin.left, margin.left + innerWidth]);
  }, [data.coordinates, innerWidth, range]);

  const yScale = useMemo(() => {
    const extent = extentOf(data.series.flatMap((series) => series.values));
    const { domain, fixed } = valueDomain(extent, yMin, yMax);
    const scale = scaleLinear()
      .domain(domain)
      .range([margin.top + innerHeight, margin.top]);
    // Rounding the domain outwards would move limits the user typed in.
    return fixed ? scale : scale.nice();
  }, [data.series, innerHeight, yMax, yMin]);

  // The axis groups only exist once the container has a size.
  useEffect(() => {
    const group = xAxisRef.current;
    if (!group) return;
    select(group).call(
      axisBottom(xScale).ticks(Math.max(2, Math.floor(innerWidth / 80))),
    );
    styleAxis(group);
  }, [innerWidth, xScale]);

  useEffect(() => {
    const axisGroup = yAxisRef.current;
    const gridGroup = gridRef.current;
    if (!axisGroup || !gridGroup) return;
    const ticks = Math.max(2, Math.floor(innerHeight / 50));
    select(axisGroup).call(axisLeft(yScale).ticks(ticks));
    styleAxis(axisGroup);
    select(gridGroup)
      .call(
        axisLeft(yScale)
          .ticks(ticks)
          .tickSize(-innerWidth)
          .tickFormat(() => ""),
      )
      .call((grid) => grid.select(".domain").remove())
      .selectAll("line")
      .attr("stroke", "#1f2937");
  }, [innerHeight, innerWidth, yScale]);

  const paths = useMemo(() => {
    const coordinates = data.coordinates;
    const indices = coordinates.map((_, index) => index);
    return data.series.map((series) =>
      line<number>()
        .defined(
          (i) => series.values[i] !== null && coordinates[i] !== null,
        )
        .x((i) => xScale(coordinates[i] as number))
        .y((i) => yScale(series.values[i] as number))(indices),
    );
  }, [data.coordinates, data.series, xScale, yScale]);

  const pointerX = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return Math.min(
      Math.max(event.clientX - bounds.left, margin.left),
      margin.left + innerWidth,
    );
  };

  const handleMouseMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const x = pointerX(event);
    if (x === null) return;
    if (drag) setDrag({ ...drag, current: x });
    const coordinates = data.coordinates.map((c) => c ?? Number.NaN);
    setHoverIndex(
      coordinates.length ? nearestIndex(coordinates, xScale.invert(x)) : null,
    );
  };

  const handleMouseDown = (event: ReactMouseEvent<SVGRectElement>) => {
    if (!zoomEnabled) return;
    const x = pointerX(event);
    if (x !== null) setDrag({ start: x, current: x });
  };

  const handleMouseUp = () => {
    if (drag && Math.abs(drag.current - drag.start) >= MIN_ZOOM_PX) {
      const [a, b] = [xScale.invert(drag.start), xScale.invert(drag.current)];
      onRangeChange({ min: Math.min(a, b), max: Math.max(a, b) });
    }
    setDrag(null);
  };

  const handleMouseLeave = () => {
    setDrag(null);
    setHoverIndex(null);
  };

  const hoverCoordinate =
    hoverIndex !== null ? data.coordinates[hoverIndex] : null;
  const ready = innerWidth > 0 && innerHeight > 0;

  return (
    <div className={styles.chart} ref={containerRef}>
      {ready && (
        <svg
          ref={svgRef}
          className={styles.svg}
          width={width}
          height={height}
          role="img"
          aria-label={`Line plot along ${data.axis}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={margin.left}
                y={margin.top}
                width={innerWidth}
                height={innerHeight}
              />
            </clipPath>
          </defs>

          <g ref={gridRef} transform={`translate(${margin.left}, 0)`} />
          <g
            ref={xAxisRef}
            transform={`translate(0, ${margin.top + innerHeight})`}
          />
          <g ref={yAxisRef} transform={`translate(${margin.left}, 0)`} />
          <text
            className={styles.axisLabel}
            x={margin.left + innerWidth / 2}
            y={height - 6}
            textAnchor="middle"
          >
            {data.axis}
          </text>

          <g clipPath={`url(#${clipId})`}>
            {paths.map((path, index) => (
              <path
                key={data.series[index].name}
                d={path ?? undefined}
                className={styles.series}
                stroke={seriesColor(index)}
              />
            ))}
          </g>

          {hoverCoordinate !== null && hoverCoordinate !== undefined && (
            <g className={styles.hover}>
              <line
                x1={xScale(hoverCoordinate)}
                x2={xScale(hoverCoordinate)}
                y1={margin.top}
                y2={margin.top + innerHeight}
              />
              {data.series.map((series, index) => {
                const value = series.values[hoverIndex as number];
                return value === null ? null : (
                  <circle
                    key={series.name}
                    cx={xScale(hoverCoordinate)}
                    cy={yScale(value)}
                    r={3.5}
                    fill={seriesColor(index)}
                  />
                );
              })}
            </g>
          )}

          {drag && (
            <rect
              className={styles.zoomBand}
              x={Math.min(drag.start, drag.current)}
              y={margin.top}
              width={Math.abs(drag.current - drag.start)}
              height={innerHeight}
            />
          )}

          <rect
            className={styles.interactionLayer}
            style={{ cursor: zoomEnabled ? "col-resize" : "crosshair" }}
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </svg>
      )}

      <ul
        className={styles.legend}
        style={{ top: margin.top + 6, right: margin.right + 6 }}
      >
        {hoverCoordinate !== null && hoverCoordinate !== undefined && (
          <li className={styles.legendCoordinate}>
            {data.axis} = {formatValue(hoverCoordinate)}
          </li>
        )}
        {data.series.map((series, index) => (
          <li key={series.name} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: seriesColor(index) }}
            />
            <span>{series.name}</span>
            {hoverIndex !== null && (
              <span className={styles.legendValue}>
                {formatValue(series.values[hoverIndex])}
              </span>
            )}
          </li>
        ))}
      </ul>

      {isRefreshing && (
        <div
          className={`${plotStyles.figureStatus} ${plotStyles.figureStatusFloating}`}
          style={{ left: margin.left + 8, right: "auto" }}
        >
          Refreshing…
        </div>
      )}
    </div>
  );
};

export default LineChart;
