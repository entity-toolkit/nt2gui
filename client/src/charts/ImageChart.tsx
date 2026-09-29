import { axisBottom, axisLeft, axisRight } from "d3";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { IImageRender } from "../api/types";
import { RefreshingBadge } from "../components/common/FigureMessage";
import { formatValue } from "../lib/format";
import { clearCrosshair, setCrosshair, useCrosshair } from "../state/crosshair";
import { IZoomWindow, ParticleScale } from "../state/schema";
import { drawAxis } from "./axis";
import { fitToBox } from "./fitToBox";
import { makeScale } from "./scales";
import { useElementSize } from "./useElementSize";
import styles from "./ImageChart.module.css";

export interface ImageAxis {
  title: string;
  scale?: ParticleScale;
  power?: number;
}

interface ImageChartProps {
  data: IImageRender;
  xAxis: ImageAxis;
  yAxis: ImageAxis;
  colorbarTitle: string;
  /** Keep the data-unit aspect ratio (spatial plots of fields). */
  preserveAspect?: boolean;
  /** While on, dragging a box zooms into it. */
  zoomEnabled: boolean;
  /** The dragged box, in data units. */
  onZoom: (window: IZoomWindow) => void;
  isRefreshing: boolean;
  /** Share the hover position with the other plots of this group. */
  crosshair?: { plotId: string; group: string };
}

const COLORBAR_WIDTH = 14;
const margin = {
  top: 14,
  right: 20 + COLORBAR_WIDTH + 6 + 52 + 24,
  bottom: 48,
  left: 72,
};
// Smaller drags are treated as clicks, not zooms.
const MIN_ZOOM_PX = 4;

const axisTitle = (axis: ImageAxis) =>
  axis.scale === "power"
    ? `${axis.title}  (∝ |·|^${axis.power ?? 0.5})`
    : axis.title;

/**
 * A server-shaded image with d3 axes and colorbar. Scales match how the
 * server binned or sampled the image (linear, log, power), so ticks show
 * data values.
 */
const ImageChart = ({
  data,
  xAxis,
  yAxis,
  colorbarTitle,
  preserveAspect = false,
  zoomEnabled,
  onZoom,
  isRefreshing,
  crosshair,
}: ImageChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const colorAxisRef = useRef<SVGGElement | null>(null);
  const gradientId = useId();
  const { width, height } = useElementSize(containerRef);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    start: [number, number];
    current: [number, number];
  } | null>(null);
  const shared = useCrosshair();

  const { extent, colorbar } = data;

  // The plot area: all the room there is, or the largest box with the data's
  // aspect ratio, centred.
  const plot = useMemo(() => {
    const room = {
      width: Math.max(width - margin.left - margin.right, 0),
      height: Math.max(height - margin.top - margin.bottom, 0),
    };
    const size = preserveAspect
      ? fitToBox(
          {
            width: Math.abs(extent.xMax - extent.xMin),
            height: Math.abs(extent.yMax - extent.yMin),
          },
          room,
        )
      : room;
    return {
      ...size,
      left: margin.left + (room.width - size.width) / 2,
      top: margin.top + (room.height - size.height) / 2,
    };
  }, [extent, height, preserveAspect, width]);

  const xScale = useMemo(
    () =>
      makeScale(xAxis.scale, xAxis.power)
        .domain([extent.xMin, extent.xMax])
        .range([plot.left, plot.left + plot.width]),
    [extent.xMax, extent.xMin, plot.left, plot.width, xAxis.power, xAxis.scale],
  );
  const yScale = useMemo(
    () =>
      makeScale(yAxis.scale, yAxis.power)
        .domain([extent.yMin, extent.yMax])
        .range([plot.top + plot.height, plot.top]),
    [extent.yMax, extent.yMin, plot.height, plot.top, yAxis.power, yAxis.scale],
  );
  const colorScale = useMemo(
    () =>
      makeScale(colorbar.scale)
        .domain([colorbar.vmin, colorbar.vmax])
        .range([plot.height, 0]),
    [colorbar.scale, colorbar.vmax, colorbar.vmin, plot.height],
  );

  useEffect(() => {
    drawAxis(
      xAxisRef.current,
      axisBottom(xScale).ticks(Math.max(2, Math.floor(plot.width / 80)), "~g"),
    );
  }, [plot.width, xScale]);
  useEffect(() => {
    drawAxis(
      yAxisRef.current,
      axisLeft(yScale).ticks(Math.max(2, Math.floor(plot.height / 50)), "~g"),
    );
  }, [plot.height, yScale]);
  useEffect(() => {
    drawAxis(
      colorAxisRef.current,
      axisRight(colorScale).ticks(
        Math.max(2, Math.floor(plot.height / 50)),
        "~g",
      ),
    );
  }, [colorScale, plot.height]);

  const pointer = (
    event: MouseEvent<SVGRectElement>,
  ): [number, number] | null => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return null;
    const clamp = (value: number, lo: number, hi: number) =>
      Math.min(Math.max(value, lo), hi);
    return [
      clamp(event.clientX - bounds.left, plot.left, plot.left + plot.width),
      clamp(event.clientY - bounds.top, plot.top, plot.top + plot.height),
    ];
  };

  const handleMouseMove = (event: MouseEvent<SVGRectElement>) => {
    const point = pointer(event);
    if (!point) return;
    if (drag) setDrag({ ...drag, current: point });
    const position = { x: xScale.invert(point[0]), y: yScale.invert(point[1]) };
    setHover(position);
    if (crosshair) setCrosshair({ ...position, ...crosshair });
  };

  const handleMouseDown = (event: MouseEvent<SVGRectElement>) => {
    if (!zoomEnabled) return;
    const point = pointer(event);
    if (point) setDrag({ start: point, current: point });
  };

  const handleMouseUp = () => {
    if (drag) {
      const [x0, y0] = drag.start;
      const [x1, y1] = drag.current;
      if (
        Math.abs(x1 - x0) >= MIN_ZOOM_PX &&
        Math.abs(y1 - y0) >= MIN_ZOOM_PX
      ) {
        const xs = [xScale.invert(x0), xScale.invert(x1)];
        const ys = [yScale.invert(y0), yScale.invert(y1)];
        onZoom({
          xMin: Math.min(...xs),
          xMax: Math.max(...xs),
          yMin: Math.min(...ys),
          yMax: Math.max(...ys),
        });
      }
    }
    setDrag(null);
  };

  const handleMouseLeave = () => {
    setHover(null);
    setDrag(null);
    if (crosshair) clearCrosshair(crosshair.plotId);
  };

  // Another plot's hover position, if it falls inside this one.
  const mirrored =
    crosshair &&
    shared &&
    shared.group === crosshair.group &&
    shared.plotId !== crosshair.plotId &&
    shared.x >= Math.min(extent.xMin, extent.xMax) &&
    shared.x <= Math.max(extent.xMin, extent.xMax) &&
    shared.y >= Math.min(extent.yMin, extent.yMax) &&
    shared.y <= Math.max(extent.yMin, extent.yMax)
      ? { x: xScale(shared.x), y: yScale(shared.y) }
      : null;

  const ready = plot.width > 0 && plot.height > 0;
  const lastColor = Math.max(colorbar.colors.length - 1, 1);

  return (
    <div className={styles.chart} ref={containerRef}>
      {ready && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${yAxis.title} against ${xAxis.title}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
              {colorbar.colors.map((color, index) => (
                <stop
                  key={index}
                  offset={`${(index / lastColor) * 100}%`}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          </defs>

          <rect
            className={styles.background}
            x={plot.left}
            y={plot.top}
            width={plot.width}
            height={plot.height}
          />
          <image
            className={styles.image}
            href={`data:image/png;base64,${data.image}`}
            x={plot.left}
            y={plot.top}
            width={plot.width}
            height={plot.height}
            preserveAspectRatio="none"
          />

          <g
            ref={xAxisRef}
            transform={`translate(0, ${plot.top + plot.height})`}
          />
          <g ref={yAxisRef} transform={`translate(${plot.left}, 0)`} />
          <text
            className="chart-title"
            x={plot.left + plot.width / 2}
            y={height - 8}
            textAnchor="middle"
          >
            {axisTitle(xAxis)}
          </text>
          <text
            className="chart-title"
            transform={`translate(${plot.left - 56}, ${plot.top + plot.height / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {axisTitle(yAxis)}
          </text>

          <g
            transform={`translate(${plot.left + plot.width + 20}, ${plot.top})`}
          >
            <rect
              width={COLORBAR_WIDTH}
              height={plot.height}
              rx={4}
              fill={`url(#${gradientId})`}
            />
            <g
              ref={colorAxisRef}
              transform={`translate(${COLORBAR_WIDTH + 6}, 0)`}
            />
            <text
              className="chart-title"
              transform={`translate(${COLORBAR_WIDTH + 6 + 60}, ${plot.height / 2}) rotate(90)`}
              textAnchor="middle"
            >
              {colorbarTitle}
            </text>
          </g>

          {mirrored && (
            <g
              className={styles.crosshair}
              transform={`translate(${mirrored.x}, ${mirrored.y})`}
            >
              <circle r={6} />
              <line x1={-10} x2={10} />
              <line y1={-10} y2={10} />
            </g>
          )}

          {drag && (
            <rect
              className={styles.zoomRect}
              x={Math.min(drag.start[0], drag.current[0])}
              y={Math.min(drag.start[1], drag.current[1])}
              width={Math.abs(drag.current[0] - drag.start[0])}
              height={Math.abs(drag.current[1] - drag.start[1])}
            />
          )}

          <rect
            className={styles.interaction}
            style={{ cursor: zoomEnabled ? "cell" : "crosshair" }}
            x={plot.left}
            y={plot.top}
            width={plot.width}
            height={plot.height}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </svg>
      )}

      {hover && (
        <div
          className={styles.readout}
          style={{ left: plot.left + 8, top: plot.top + 8 }}
        >
          {xAxis.title} = {formatValue(hover.x)}, {yAxis.title} ={" "}
          {formatValue(hover.y)}
        </div>
      )}
      {isRefreshing && <RefreshingBadge style={{ right: margin.right + 8 }} />}
    </div>
  );
};

export default ImageChart;
