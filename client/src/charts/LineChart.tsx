import { axisBottom, axisLeft, line } from "d3";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  binIndex,
  logValueDomain,
  makeScale,
  scaleExtent,
  stepPath,
  nearestIndex,
  panScale,
  valueDomain,
} from "./scales";
import { ILineRender } from "../api/types";
import { RefreshingBadge } from "../components/common/FigureMessage";
import { formatValue } from "../lib/format";
import { ChartRegion } from "../state/regions";
import { IRange, ParticleScale } from "../state/schema";
import { drawAxis, drawGrid } from "./axis";
import { seriesColor } from "./colors";
import { useElementSize } from "./useElementSize";
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
  /** Coordinate-axis scale (default linear); power uses sign(A)·|A|^p. */
  xScaleKind?: ParticleScale;
  xPower?: number;
  yLog?: boolean;
  /** Histograms: `coordinates` are bin edges and lines are drawn as steps. */
  step?: boolean;
  /**
   * When set (typically while zoomed), dragging outside zoom mode pans the
   * view, staying within `bounds` (data units) if given.
   */
  pan?: { bounds?: [number, number] };
  onPan?: (range: IRange) => void;
  /** While on, dragging selects a coordinate range (for `onSelect`) instead of zooming. */
  selectEnabled?: boolean;
  onSelect?: (range: IRange) => void;
  /** Saved regions to outline (their `x` extent). */
  regions?: ChartRegion[];
}

const margin = { top: 14, right: 18, bottom: 42, left: 64 };
// Smaller drags are treated as clicks.
const MIN_DRAG_PX = 4;

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
  xScaleKind = "linear",
  xPower,
  yLog = false,
  step = false,
  pan,
  onPan,
  selectEnabled = false,
  onSelect,
  regions = [],
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
  // Pointer x where a pan started, and how far the content has moved.
  const [panning, setPanning] = useState<{
    start: number;
    shift: number;
  } | null>(null);
  const [drag, setDrag] = useState<{ start: number; current: number } | null>(
    null,
  );

  const xScale = useMemo(() => {
    const domain = range
      ? [range.min, range.max]
      : (scaleExtent(data.coordinates, xScaleKind) ??
        (xScaleKind === "log" ? [1, 10] : [0, 1]));
    return makeScale(xScaleKind, xPower)
      .domain(domain)
      .range([margin.left, margin.left + innerWidth]);
  }, [data.coordinates, innerWidth, range, xPower, xScaleKind]);

  const yScale = useMemo(() => {
    const values = data.series.flatMap((series) => series.values);
    const { domain, fixed } = yLog
      ? logValueDomain(scaleExtent(values, "log"), yMin, yMax)
      : valueDomain(scaleExtent(values), yMin, yMax);
    const scale = makeScale(yLog ? "log" : "linear")
      .domain(domain)
      .range([margin.top + innerHeight, margin.top]);
    // Rounding the domain outwards would move limits the user typed in.
    return fixed ? scale : scale.nice();
  }, [data.series, innerHeight, yLog, yMax, yMin]);

  // Zero or negative values have no place on a log axis: leave gaps.
  const isDrawable = useCallback(
    (value: number | null): value is number =>
      value !== null && (!yLog || value > 0),
    [yLog],
  );

  // The axis groups only exist once the container has a size.
  useEffect(() => {
    drawAxis(
      xAxisRef.current,
      axisBottom(xScale).ticks(Math.max(2, Math.floor(innerWidth / 80)), "~g"),
    );
  }, [innerWidth, xScale]);

  useEffect(() => {
    const ticks = Math.max(2, Math.floor(innerHeight / 50));
    drawAxis(yAxisRef.current, axisLeft(yScale).ticks(ticks, "~g"));
    drawGrid(gridRef.current, axisLeft(yScale).ticks(ticks), innerWidth);
  }, [innerHeight, innerWidth, yScale]);

  const paths = useMemo(() => {
    const coordinates = data.coordinates;
    if (step) {
      return data.series.map((series) =>
        stepPath(coordinates, series.values, xScale, yScale, isDrawable),
      );
    }
    const indices = coordinates.map((_, index) => index);
    return data.series.map((series) =>
      line<number>()
        .defined((i) => isDrawable(series.values[i]) && coordinates[i] !== null)
        .x((i) => xScale(coordinates[i] as number))
        .y((i) => yScale(series.values[i] as number))(indices),
    );
  }, [data.coordinates, data.series, isDrawable, step, xScale, yScale]);

  const pointerX = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return Math.min(
      Math.max(event.clientX - bounds.left, margin.left),
      margin.left + innerWidth,
    );
  };

  const handleMouseMove = (event: ReactMouseEvent<SVGRectElement>) => {
    if (panning) {
      const { shift } = panScale(
        xScale,
        event.clientX - panning.start,
        pan?.bounds,
      );
      setPanning({ ...panning, shift });
      setHoverIndex(null);
      return;
    }
    const x = pointerX(event);
    if (x === null) return;
    if (drag) setDrag({ ...drag, current: x });
    const coordinates = data.coordinates.map((c) => c ?? Number.NaN);
    if (!coordinates.length) {
      setHoverIndex(null);
    } else if (step) {
      // Coordinates are bin edges: pick the bin under the pointer.
      setHoverIndex(binIndex(coordinates, xScale.invert(x)));
    } else {
      setHoverIndex(nearestIndex(coordinates, xScale.invert(x)));
    }
  };

  const handleMouseDown = (event: ReactMouseEvent<SVGRectElement>) => {
    if (!zoomEnabled && !selectEnabled) {
      if (pan && onPan) setPanning({ start: event.clientX, shift: 0 });
      return;
    }
    const x = pointerX(event);
    if (x !== null) setDrag({ start: x, current: x });
  };

  const handleMouseUp = () => {
    if (panning) {
      if (Math.abs(panning.shift) >= MIN_DRAG_PX && onPan) {
        const [a, b] = panScale(xScale, panning.shift, pan?.bounds).domain;
        onPan({ min: Math.min(a, b), max: Math.max(a, b) });
      }
      setPanning(null);
      return;
    }
    if (drag && Math.abs(drag.current - drag.start) >= MIN_DRAG_PX) {
      const [a, b] = [xScale.invert(drag.start), xScale.invert(drag.current)];
      const range = { min: Math.min(a, b), max: Math.max(a, b) };
      if (selectEnabled) onSelect?.(range);
      else onRangeChange(range);
    }
    setDrag(null);
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setDrag(null);
    setHoverIndex(null);
  };

  const hoverCoordinate = (() => {
    if (hoverIndex === null) return null;
    const start = data.coordinates[hoverIndex];
    const end = data.coordinates[hoverIndex + 1];
    if (!step || start === null || end === null || end === undefined) {
      return start;
    }
    // The bin's visual centre, which on a log axis is the geometric mean.
    return xScale.invert((xScale(start) + xScale(end)) / 2);
  })();
  const ready = innerWidth > 0 && innerHeight > 0;

  // Region edges in pixels, kept just outside the plot when off-scale (or
  // not positive on a log axis).
  const regionPx = (value: number) => {
    const px = xScale(value);
    const [left, right] = [margin.left - 1, margin.left + innerWidth + 1];
    if (!Number.isFinite(px)) return value > 0 ? right : left;
    return Math.min(Math.max(px, left), right);
  };
  const regionBands = regions.flatMap((region) => {
    if (!region.x) return [];
    const [a, b] = region.x.map(regionPx);
    const width = Math.abs(b - a);
    return width > 0
      ? [
          {
            name: region.name,
            color: region.color,
            left: Math.min(a, b),
            width,
          },
        ]
      : [];
  });

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
            <g
              transform={panning ? `translate(${panning.shift}, 0)` : undefined}
            >
              {regionBands.map((band) => (
                <g
                  key={band.name}
                  className="chart-region"
                  style={{ color: band.color }}
                >
                  <rect
                    x={band.left}
                    y={margin.top}
                    width={band.width}
                    height={innerHeight}
                  />
                  <text x={band.left + 4} y={margin.top + 12}>
                    {band.name}
                  </text>
                </g>
              ))}
              {paths.map((path, index) => (
                <path
                  key={data.series[index].name}
                  d={path ?? undefined}
                  className={styles.series}
                  stroke={seriesColor(index)}
                />
              ))}
            </g>
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
                return !isDrawable(value) ? null : (
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
              className={selectEnabled ? "chart-selection" : styles.zoomBand}
              x={Math.min(drag.start, drag.current)}
              y={margin.top}
              width={Math.abs(drag.current - drag.start)}
              height={innerHeight}
            />
          )}

          <rect
            className={styles.interactionLayer}
            style={{
              cursor:
                zoomEnabled || selectEnabled
                  ? "col-resize"
                  : pan && onPan
                    ? panning
                      ? "grabbing"
                      : "grab"
                    : "crosshair",
            }}
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
        <RefreshingBadge style={{ left: margin.left + 8, right: "auto" }} />
      )}
    </div>
  );
};

export default LineChart;
