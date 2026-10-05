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
import {
  ChartRegion,
  ChartSelection,
  polygonArea,
  simplifyPath,
} from "../state/regions";
import { IZoomWindow, ParticleScale } from "../state/schema";
import { drawAxis } from "./axis";
import { fitToBox } from "./fitToBox";
import { makeScale, panScale } from "./scales";
import { useElementSize } from "./useElementSize";
import styles from "./ImageChart.module.css";

/** Selection mode: a freehand lasso or a box; with only one axis on, a band. */
export interface ImageSelect {
  shape: "lasso" | "box";
  x: boolean;
  y: boolean;
}

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
  /**
   * When set (typically while zoomed), dragging outside zoom mode pans the
   * view along the enabled axes, staying within `bounds` (data units).
   */
  pan?: {
    x: boolean;
    y: boolean;
    bounds?: { x?: [number, number]; y?: [number, number] };
  };
  onPan?: (window: IZoomWindow) => void;
  /**
   * While set, dragging selects instead of zooming or panning: a freehand
   * lasso or a box. With only one of `x`/`y` on, the box is a band spanning
   * the other axis.
   */
  select?: ImageSelect;
  onSelect?: (selection: ChartSelection) => void;
  /** Saved regions to outline. */
  regions?: ChartRegion[];
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
// Smaller lassos (in px²) are treated as clicks.
const MIN_LASSO_AREA = 25;

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
  pan,
  onPan,
  select,
  onSelect,
  regions = [],
}: ImageChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const colorAxisRef = useRef<SVGGElement | null>(null);
  const gradientId = useId();
  const { width, height } = useElementSize(containerRef);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const clipId = useId();
  // Pointer position where a pan started, and how far the image has moved.
  const [panning, setPanning] = useState<{
    start: [number, number];
    shift: [number, number];
  } | null>(null);
  const [drag, setDrag] = useState<{
    start: [number, number];
    current: [number, number];
  } | null>(null);
  // After a pan is released: the panned window (data units), kept until the
  // image for it arrives. Meanwhile the current image stays where it was
  // dragged to (drawn at its own extent), rather than jumping back.
  const [pannedView, setPannedView] = useState<{
    data: IImageRender;
    x: [number, number];
    y: [number, number];
  } | null>(null);
  const view = pannedView?.data === data ? pannedView : null;
  // The lasso being drawn, in pixels.
  const [lasso, setLasso] = useState<[number, number][] | null>(null);
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
        .domain(view?.x ?? [extent.xMin, extent.xMax])
        .range([plot.left, plot.left + plot.width]),
    [
      extent.xMax,
      extent.xMin,
      plot.left,
      plot.width,
      view?.x,
      xAxis.power,
      xAxis.scale,
    ],
  );
  const yScale = useMemo(
    () =>
      makeScale(yAxis.scale, yAxis.power)
        .domain(view?.y ?? [extent.yMin, extent.yMax])
        .range([plot.top + plot.height, plot.top]),
    [
      extent.yMax,
      extent.yMin,
      plot.height,
      plot.top,
      view?.y,
      yAxis.power,
      yAxis.scale,
    ],
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

  /** Pans of both axes for a pointer offset, limited to the bounds. */
  const panBy = (dx: number, dy: number) => ({
    x: panScale(xScale, pan?.x ? dx : 0, pan?.bounds?.x),
    y: panScale(yScale, pan?.y ? dy : 0, pan?.bounds?.y),
  });

  const handleMouseMove = (event: MouseEvent<SVGRectElement>) => {
    if (panning) {
      const moved = panBy(
        event.clientX - panning.start[0],
        event.clientY - panning.start[1],
      );
      setPanning({ ...panning, shift: [moved.x.shift, moved.y.shift] });
      return;
    }
    const point = pointer(event);
    if (!point) return;
    if (drag) setDrag({ ...drag, current: point });
    if (lasso) setLasso([...lasso, point]);
    const position = { x: xScale.invert(point[0]), y: yScale.invert(point[1]) };
    setHover(position);
    if (crosshair) setCrosshair({ ...position, ...crosshair });
  };

  const handleMouseDown = (event: MouseEvent<SVGRectElement>) => {
    if (!zoomEnabled && select) {
      const point = pointer(event);
      if (!point) return;
      if (select.shape === "lasso") setLasso([point]);
      else setDrag({ start: point, current: point });
      return;
    }
    if (!zoomEnabled) {
      if (pan && onPan) {
        setPanning({ start: [event.clientX, event.clientY], shift: [0, 0] });
      }
      return;
    }
    const point = pointer(event);
    if (point) setDrag({ start: point, current: point });
  };

  /** The dragged box in pixels; a band spans the whole unselected axis. */
  const dragBox = (box: NonNullable<typeof drag>) => {
    const band = !zoomEnabled && select;
    const full = (on: boolean | undefined) => band && !on;
    const [x0, x1] = full(select?.x)
      ? [plot.left, plot.left + plot.width]
      : [box.start[0], box.current[0]];
    const [y0, y1] = full(select?.y)
      ? [plot.top, plot.top + plot.height]
      : [box.start[1], box.current[1]];
    return {
      left: Math.min(x0, x1),
      top: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    };
  };

  const finishSelection = () => {
    if (lasso) {
      const points = simplifyPath(lasso);
      if (points.length >= 3 && polygonArea(points) >= MIN_LASSO_AREA) {
        onSelect?.({
          kind: "lasso",
          points: points.map(([px, py]) => [
            xScale.invert(px),
            yScale.invert(py),
          ]),
        });
      }
      setLasso(null);
    }
    if (drag) {
      const box = dragBox(drag);
      // Only the selected axes need a real extent (a band is full-size).
      const big =
        (!select?.x || box.width >= MIN_ZOOM_PX) &&
        (!select?.y || box.height >= MIN_ZOOM_PX);
      if (big) {
        const xs = [
          xScale.invert(box.left),
          xScale.invert(box.left + box.width),
        ];
        const ys = [
          yScale.invert(box.top),
          yScale.invert(box.top + box.height),
        ];
        onSelect?.({
          kind: "box",
          xMin: Math.min(...xs),
          xMax: Math.max(...xs),
          yMin: Math.min(...ys),
          yMax: Math.max(...ys),
        });
      }
      setDrag(null);
    }
  };

  const handleMouseUp = () => {
    if (!zoomEnabled && select) {
      finishSelection();
      return;
    }
    if (panning) {
      const [dx, dy] = panning.shift;
      if (onPan && Math.hypot(dx, dy) >= MIN_ZOOM_PX) {
        const moved = panBy(dx, dy);
        const [x0, x1] = moved.x.domain;
        const [y0, y1] = moved.y.domain;
        setPannedView({ data, x: moved.x.domain, y: moved.y.domain });
        onPan({
          xMin: Math.min(x0, x1),
          xMax: Math.max(x0, x1),
          yMin: Math.min(y0, y1),
          yMax: Math.max(y0, y1),
        });
      }
      setPanning(null);
      return;
    }
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
    handleMouseUp();
    setHover(null);
    setDrag(null);
    setLasso(null);
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
  // The image covers its extent: the whole plot, unless a pan moved the view.
  const [ix0, ix1] = [xScale(extent.xMin), xScale(extent.xMax)];
  const [iy0, iy1] = [yScale(extent.yMin), yScale(extent.yMax)];
  const imageBox = {
    x: Math.min(ix0, ix1),
    y: Math.min(iy0, iy1),
    width: Math.abs(ix1 - ix0),
    height: Math.abs(iy1 - iy0),
  };

  // Saved regions in pixels; values off a log axis land just outside the plot.
  const toPx = (
    scale: typeof xScale,
    value: number,
    lo: number,
    hi: number,
  ) => {
    const px = scale(value);
    const [a, b] = [Math.min(lo, hi) - 1, Math.max(lo, hi) + 1];
    if (!Number.isFinite(px)) return value > 0 ? hi : lo;
    return Math.min(Math.max(px, a), b);
  };
  const xPx = (value: number) =>
    toPx(xScale, value, plot.left, plot.left + plot.width);
  const yPx = (value: number) =>
    toPx(yScale, value, plot.top + plot.height, plot.top);
  const regionShapes = regions.map((region) => {
    if (region.polygon) {
      const points = region.polygon.map(([x, y]) => [xPx(x), yPx(y)]);
      return {
        name: region.name,
        color: region.color,
        path: `M${points.map((p) => p.join(",")).join("L")}Z`,
        label: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ] as const,
      };
    }
    const [x0, x1] = region.x
      ? region.x.map(xPx)
      : [plot.left, plot.left + plot.width];
    const [y0, y1] = region.y
      ? region.y.map(yPx)
      : [plot.top, plot.top + plot.height];
    const rect = {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    };
    return {
      name: region.name,
      color: region.color,
      rect,
      label: [rect.x, rect.y] as const,
    };
  });
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
            <clipPath id={clipId}>
              <rect
                x={plot.left}
                y={plot.top}
                width={plot.width}
                height={plot.height}
              />
            </clipPath>
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
          <g clipPath={`url(#${clipId})`}>
            <image
              className={styles.image}
              href={`data:image/png;base64,${data.image}`}
              {...imageBox}
              preserveAspectRatio="none"
              transform={
                panning
                  ? `translate(${panning.shift[0]}, ${panning.shift[1]})`
                  : undefined
              }
            />
            <g
              transform={
                panning
                  ? `translate(${panning.shift[0]}, ${panning.shift[1]})`
                  : undefined
              }
            >
              {regionShapes.map((shape) => (
                <g
                  key={shape.name}
                  className="chart-region"
                  style={{ color: shape.color }}
                >
                  {shape.path ? (
                    <path d={shape.path} />
                  ) : (
                    <rect {...shape.rect} />
                  )}
                  <text x={shape.label[0] + 4} y={shape.label[1] + 12}>
                    {shape.name}
                  </text>
                </g>
              ))}
            </g>
          </g>

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
              className={
                !zoomEnabled && select ? "chart-selection" : styles.zoomRect
              }
              x={dragBox(drag).left}
              y={dragBox(drag).top}
              width={dragBox(drag).width}
              height={dragBox(drag).height}
            />
          )}
          {lasso && (
            <path
              className="chart-selection"
              d={`M${lasso.map((p) => p.join(",")).join("L")}Z`}
            />
          )}

          <rect
            className={styles.interaction}
            style={{
              cursor:
                zoomEnabled || select
                  ? "cell"
                  : pan && onPan
                    ? panning
                      ? "grabbing"
                      : "grab"
                    : "crosshair",
            }}
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
