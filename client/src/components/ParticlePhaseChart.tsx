import { axisBottom, axisLeft, axisRight, select } from "d3";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { makeScale } from "../chartScales";
import { IParticleAxis, IZoomWindow } from "../global";
import { useElementSize } from "../hooks/useElementSize";
import { IParticlePhase } from "../services/particleService";
import plotStyles from "./Plot.module.css";
import styles from "./ParticlePhaseChart.module.css";

interface ParticlePhaseChartProps {
  data: IParticlePhase;
  xAxis: IParticleAxis;
  yAxis: IParticleAxis;
  isRefreshing: boolean;
  /** While on, dragging a box zooms into it. */
  zoomEnabled: boolean;
  /** The dragged box, in data units. */
  onZoom: (window: IZoomWindow) => void;
}

// Smaller drags are treated as clicks, not zooms.
const MIN_ZOOM_PX = 4;

const colorbarWidth = 14;
const margin = {
  top: 14,
  right: 20 + colorbarWidth + 8 + 52 + 24,
  bottom: 48,
  left: 72,
};

const styleAxis = (group: SVGGElement) => {
  const selection = select(group);
  selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
  selection.selectAll("line").attr("stroke", "#475569");
  selection.selectAll("path").attr("stroke", "#475569");
};

const axisTitle = (axis: IParticleAxis) =>
  axis.scale === "power"
    ? `${axis.quantity}  (∝ |·|^${axis.power ?? 0.5})`
    : axis.quantity;

const format = (value: number) => Number(value.toPrecision(4)).toString();

/**
 * A weighted 2D particle histogram. The server shades the bins (uniform in
 * each axis' scaled space); axes and colorbar are d3 scales of the same kind,
 * so ticks show real values.
 */
const ParticlePhaseChart = ({
  data,
  xAxis,
  yAxis,
  isRefreshing,
  zoomEnabled,
  onZoom,
}: ParticlePhaseChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const colorAxisRef = useRef<SVGGElement | null>(null);
  const gradientId = useId();
  const { width, height } = useElementSize(containerRef);
  const innerWidth = Math.max(width - margin.left - margin.right, 0);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  // Drag corners in SVG pixels, clamped to the plot area.
  const [drag, setDrag] = useState<{
    start: [number, number];
    current: [number, number];
  } | null>(null);

  const { extent, colorbar } = data;
  const xScale = useMemo(
    () =>
      makeScale(xAxis.scale, xAxis.power)
        .domain([extent.xMin, extent.xMax])
        .range([margin.left, margin.left + innerWidth]),
    [extent.xMax, extent.xMin, innerWidth, xAxis.power, xAxis.scale],
  );
  const yScale = useMemo(
    () =>
      makeScale(yAxis.scale, yAxis.power)
        .domain([extent.yMin, extent.yMax])
        .range([margin.top + innerHeight, margin.top]),
    [extent.yMax, extent.yMin, innerHeight, yAxis.power, yAxis.scale],
  );
  const colorScale = useMemo(
    () =>
      makeScale(colorbar.scale)
        .domain([colorbar.vmin, colorbar.vmax])
        .range([innerHeight, 0]),
    [colorbar.scale, colorbar.vmax, colorbar.vmin, innerHeight],
  );

  useEffect(() => {
    const group = xAxisRef.current;
    if (!group) return;
    select(group).call(
      axisBottom(xScale).ticks(Math.max(2, Math.floor(innerWidth / 80)), "~g"),
    );
    styleAxis(group);
  }, [innerWidth, xScale]);

  useEffect(() => {
    const group = yAxisRef.current;
    if (!group) return;
    select(group).call(
      axisLeft(yScale).ticks(Math.max(2, Math.floor(innerHeight / 50)), "~g"),
    );
    styleAxis(group);
  }, [innerHeight, yScale]);

  useEffect(() => {
    const group = colorAxisRef.current;
    if (!group) return;
    select(group).call(
      axisRight(colorScale).ticks(
        Math.max(2, Math.floor(innerHeight / 50)),
        colorbar.scale === "log" ? "~e" : "~g",
      ),
    );
    styleAxis(group);
  }, [colorScale, colorbar.scale, innerHeight]);

  const pointer = (
    event: ReactMouseEvent<SVGRectElement>,
  ): [number, number] | null => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return null;
    const clamp = (value: number, lo: number, hi: number) =>
      Math.min(Math.max(value, lo), hi);
    return [
      clamp(event.clientX - bounds.left, margin.left, margin.left + innerWidth),
      clamp(event.clientY - bounds.top, margin.top, margin.top + innerHeight),
    ];
  };

  const handleMouseMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const point = pointer(event);
    if (!point) return;
    if (drag) setDrag({ ...drag, current: point });
    setHover({ x: xScale.invert(point[0]), y: yScale.invert(point[1]) });
  };

  const handleMouseDown = (event: ReactMouseEvent<SVGRectElement>) => {
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

  const ready = innerWidth > 0 && innerHeight > 0;
  const lastColor = colorbar.colors.length - 1;

  return (
    <div className={styles.chart} ref={containerRef}>
      {ready && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${yAxis.quantity} against ${xAxis.quantity}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
              {colorbar.colors.map((color, index) => (
                <stop
                  key={index}
                  offset={`${(index / Math.max(lastColor, 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          </defs>

          <rect
            className={styles.background}
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
          />
          <image
            className={styles.image}
            href={`data:image/png;base64,${data.image}`}
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            preserveAspectRatio="none"
          />

          <g
            ref={xAxisRef}
            transform={`translate(0, ${margin.top + innerHeight})`}
          />
          <g ref={yAxisRef} transform={`translate(${margin.left}, 0)`} />
          <text
            className={styles.title}
            x={margin.left + innerWidth / 2}
            y={height - 8}
            textAnchor="middle"
          >
            {axisTitle(xAxis)}
          </text>
          <text
            className={styles.title}
            transform={`translate(16, ${margin.top + innerHeight / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {axisTitle(yAxis)}
          </text>

          <g
            transform={`translate(${margin.left + innerWidth + 20}, ${margin.top})`}
          >
            <rect
              width={colorbarWidth}
              height={innerHeight}
              rx={4}
              fill={`url(#${gradientId})`}
            />
            <g
              ref={colorAxisRef}
              transform={`translate(${colorbarWidth + 6}, 0)`}
            />
            <text
              className={styles.title}
              transform={`translate(${colorbarWidth + 6 + 60}, ${innerHeight / 2}) rotate(90)`}
              textAnchor="middle"
            >
              weighted count
            </text>
          </g>

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
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setHover(null);
              setDrag(null);
            }}
          />
        </svg>
      )}

      {hover && (
        <div
          className={styles.readout}
          style={{ left: margin.left + 8, top: margin.top + 8 }}
        >
          {xAxis.quantity} = {format(hover.x)}, {yAxis.quantity} ={" "}
          {format(hover.y)}
        </div>
      )}
      {isRefreshing && (
        <div
          className={`${plotStyles.figureStatus} ${plotStyles.figureStatusFloating}`}
          style={{ right: margin.right + 8 }}
        >
          Refreshing…
        </div>
      )}
    </div>
  );
};

export default ParticlePhaseChart;
