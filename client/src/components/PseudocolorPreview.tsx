import {
  axisBottom,
  axisLeft,
  axisRight,
  scaleLinear,
  select,
  NumberValue,
} from "d3";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PseudocolorResponse } from "../services/renderService";
import { ITooltipDatum, IZoomWindow } from "../global";
import { fitToBox } from "../fitToBox";
import { useElementSize } from "../hooks/useElementSize";
import styles from "./PseudocolorPreview.module.css";
import plotStyles from "./Plot.module.css";

interface PseudocolorPreviewProps {
  render: PseudocolorResponse;
  isRefreshing: boolean;
  zoomEnabled: boolean;
  viewport: IZoomWindow | null;
  onViewportChange: (viewport: IZoomWindow | null) => void;
  plotId: string;
  globalTooltip: ITooltipDatum | null;
  onGlobalTooltipChange: (tooltip: ITooltipDatum | null) => void;
  xLabel: string;
  yLabel: string;
  colorbarLabel: string;
}

const colorbarWidth = 14;
const colorbarGap = 20;
const tickLabelGap = 8;
// Room for a (rotated) axis title: font size plus padding.
const titleSpace = 22;

/**
 * Margins around the image, sized from the measured width of the tick labels
 * so that long labels (e.g. "-0.00125" on the colorbar) are never clipped.
 */
const computeMargin = (labels: { yTicks: number; colorbarTicks: number }) => ({
  top: 16,
  bottom: 30 + titleSpace,
  left: 12 + labels.yTicks + titleSpace,
  right:
    colorbarGap +
    colorbarWidth +
    tickLabelGap +
    labels.colorbarTicks +
    titleSpace +
    6,
});

const tickFormatter = (labels: string[]) =>
  function formatTick(_value: NumberValue, index: number) {
    return labels[index] ?? "";
  };

type TooltipDisplay = {
  x: number;
  y: number;
  color: string;
  value?: number;
  posPct: { x: number; y: number };
};

type PointerPoint = {
  x: number;
  y: number;
  svgX: number;
  svgY: number;
  posPct: { x: number; y: number };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

const rgbToHex = (r: number, g: number, b: number) =>
  `#${toHex(r)}${toHex(g)}${toHex(b)}`;

const hexToRgb = (hex: string): [number, number, number] | null => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
};

const PseudocolorPreview = ({
  render,
  isRefreshing,
  zoomEnabled,
  viewport,
  onViewportChange,
  plotId,
  globalTooltip,
  onGlobalTooltipChange,
  xLabel,
  yLabel,
  colorbarLabel,
}: PseudocolorPreviewProps) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const colorbarAxisRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerSize = useElementSize(containerRef);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragStart, setDragStart] = useState<PointerPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<PointerPoint | null>(null);
  const gradientId = useId();
  // Widest tick label of each vertical axis, measured after d3 draws them.
  const [labelWidths, setLabelWidths] = useState({
    yTicks: 36,
    colorbarTicks: 36,
  });
  const margin = useMemo(() => computeMargin(labelWidths), [labelWidths]);

  const { width: imageWidth, height: imageHeight } = render.imageSize;
  const xRange = render.extent.xMax - render.extent.xMin;
  const yRange = render.extent.yMax - render.extent.yMin;
  const extentAspect = Math.abs(
    yRange / Math.max(Math.abs(xRange), Number.EPSILON),
  );
  const sourceArea = Math.max(imageWidth * imageHeight, 1);
  const innerWidth = Math.sqrt(sourceArea / extentAspect);
  const innerHeight = innerWidth * extentAspect;
  const outerWidth = innerWidth + margin.left + margin.right;
  const outerHeight = innerHeight + margin.top + margin.bottom;
  // Scale the whole figure (axes and colorbar included) to fit the panel
  // along its limiting side, keeping the aspect ratio so it never overflows.
  const fittedSize = fitToBox(
    { width: outerWidth, height: outerHeight },
    containerSize,
  );

  const imageHref = useMemo(
    () => `data:image/png;base64,${render.image}`,
    [render.image],
  );

  const activeExtent = viewport ?? render.extent;

  const xScale = useMemo(
    () =>
      scaleLinear()
        .domain([activeExtent.xMin, activeExtent.xMax])
        .range([margin.left, margin.left + innerWidth]),
    [activeExtent.xMax, activeExtent.xMin, innerWidth, margin.left],
  );

  const yScale = useMemo(
    () =>
      scaleLinear()
        .domain([activeExtent.yMin, activeExtent.yMax])
        .range([margin.top + innerHeight, margin.top]),
    [activeExtent.yMax, activeExtent.yMin, innerHeight, margin.top],
  );

  useEffect(() => {
    const xAxis = axisBottom(xScale)
      .tickValues(render.xTicks.positions)
      .tickFormat(tickFormatter(render.xTicks.labels));

    const selection = select(xAxisRef.current!);
    selection.call(xAxis);
    selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
    selection.selectAll("line").attr("stroke", "#475569");
    selection.selectAll("path").attr("stroke", "#475569");
  }, [render.xTicks.labels, render.xTicks.positions, xScale]);

  useEffect(() => {
    const yAxis = axisLeft(yScale)
      .tickValues(render.yTicks.positions)
      .tickFormat(tickFormatter(render.yTicks.labels));

    const selection = select(yAxisRef.current!);
    selection.call(yAxis);
    selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
    selection.selectAll("line").attr("stroke", "#475569");
    selection.selectAll("path").attr("stroke", "#475569");
  }, [render.yTicks.labels, render.yTicks.positions, yScale]);

  useEffect(() => {
    const colorScale = scaleLinear()
      .domain([render.colorbar.vmin, render.colorbar.vmax])
      .range([innerHeight, 0]);

    const colorbarAxis = axisRight(colorScale)
      .tickValues(render.colorbar.ticks)
      .tickFormat(tickFormatter(render.colorbar.labels));

    const selection = select(colorbarAxisRef.current!);
    selection.call(colorbarAxis);
    selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
    selection.selectAll("line").attr("stroke", "#475569");
    selection.selectAll("path").attr("stroke", "#475569");
  }, [
    innerHeight,
    render.colorbar.labels,
    render.colorbar.ticks,
    render.colorbar.vmax,
    render.colorbar.vmin,
  ]);

  // Runs after the axis effects above, once their tick labels exist. Sizes
  // are in SVG user units, so they hold however the figure is scaled.
  useEffect(() => {
    const widest = (group: SVGGElement | null) => {
      let width = 0;
      group?.querySelectorAll("text").forEach((text) => {
        width = Math.max(width, text.getBBox().width);
      });
      return Math.ceil(width);
    };
    const next = {
      yTicks: widest(yAxisRef.current),
      colorbarTicks: widest(colorbarAxisRef.current),
    };
    setLabelWidths((prev) =>
      prev.yTicks === next.yTicks && prev.colorbarTicks === next.colorbarTicks
        ? prev
        : next,
    );
  }, [
    render.colorbar.labels,
    render.xTicks.labels,
    render.yTicks.labels,
    xScale,
    yScale,
  ]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = offscreenCanvasRef.current ?? document.createElement("canvas");
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      offscreenCanvasRef.current = canvas;
    };

    image.src = imageHref;
  }, [imageHeight, imageHref, imageWidth]);

  const approximateValueFromColor = (color: string) => {
    const targetRgb = hexToRgb(color);
    if (!targetRgb || !render.colorbar.colors.length) return undefined;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    render.colorbar.colors.forEach((hex, index) => {
      const current = hexToRgb(hex);
      if (!current) return;
      const distance =
        (current[0] - targetRgb[0]) ** 2 +
        (current[1] - targetRgb[1]) ** 2 +
        (current[2] - targetRgb[2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const colorSteps = Math.max(render.colorbar.colors.length - 1, 1);
    const position = bestIndex / colorSteps;
    return (
      render.colorbar.vmin +
      position * (render.colorbar.vmax - render.colorbar.vmin)
    );
  };

  const sampleColorAt = (x: number, y: number) => {
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return null;

    const context = canvas.getContext("2d");
    if (!context) return null;

    const ratioX = clamp01(
      (x - render.extent.xMin) /
        Math.max(render.extent.xMax - render.extent.xMin, Number.EPSILON),
    );
    const ratioY = clamp01(
      (y - render.extent.yMin) /
        Math.max(render.extent.yMax - render.extent.yMin, Number.EPSILON),
    );

    const pixelX = Math.round(ratioX * (imageWidth - 1));
    const pixelY = Math.round((1 - ratioY) * (imageHeight - 1));
    const pixel = context.getImageData(pixelX, pixelY, 1, 1).data;
    const color = rgbToHex(pixel[0], pixel[1], pixel[2]);
    const value = approximateValueFromColor(color);

    return { color, value };
  };

  const pointToTooltip = (point: PointerPoint): TooltipDisplay => {
    const colorInfo = sampleColorAt(point.x, point.y);
    return {
      x: point.x,
      y: point.y,
      color: colorInfo?.color ?? "#ffffff",
      value: colorInfo?.value,
      posPct: point.posPct,
    };
  };

  const clampToExtent = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const eventToPoint = (
    event: ReactMouseEvent<SVGRectElement>,
  ): PointerPoint | null => {
    const svgElement = svgRef.current;
    if (!svgElement) return null;

    const bounds = svgElement.getBoundingClientRect();
    const scaleX = outerWidth / bounds.width;
    const scaleY = outerHeight / bounds.height;

    const relativeX = event.clientX - bounds.left;
    const relativeY = event.clientY - bounds.top;

    const svgX = relativeX * scaleX;
    const svgY = relativeY * scaleY;

    if (
      svgX < margin.left ||
      svgX > margin.left + innerWidth ||
      svgY < margin.top ||
      svgY > margin.top + innerHeight
    ) {
      return null;
    }

    const xValue = xScale.invert(svgX);
    const yValue = yScale.invert(svgY);

    return {
      x: clampToExtent(xValue, render.extent.xMin, render.extent.xMax),
      y: clampToExtent(yValue, render.extent.yMin, render.extent.yMax),
      svgX,
      svgY,
      posPct: {
        x: (relativeX / bounds.width) * 100,
        y: (relativeY / bounds.height) * 100,
      },
    };
  };

  const emitGlobalTooltip = (tooltip: TooltipDisplay | null) => {
    if (!tooltip) {
      if (globalTooltip?.plotId === plotId) {
        onGlobalTooltipChange(null);
      }
      return;
    }

    onGlobalTooltipChange({
      x: tooltip.x,
      y: tooltip.y,
      color: tooltip.color,
      value: tooltip.value,
      plotId,
    });
  };

  const handlePointerMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const point = eventToPoint(event);
    if (!point) {
      emitGlobalTooltip(null);
      return;
    }

    const tooltip = pointToTooltip(point);
    if (dragStart) {
      setDragCurrent(point);
    }
    emitGlobalTooltip(tooltip);
  };

  const handlePointerLeave = () => {
    setDragStart(null);
    setDragCurrent(null);
    emitGlobalTooltip(null);
  };

  const handlePointerDown = (event: ReactMouseEvent<SVGRectElement>) => {
    if (!zoomEnabled) return;
    const point = eventToPoint(event);
    if (!point) return;
    setDragStart(point);
    setDragCurrent(point);
  };

  const handlePointerUp = () => {
    if (dragStart && dragCurrent) {
      const xMin = Math.min(dragStart.x, dragCurrent.x);
      const xMax = Math.max(dragStart.x, dragCurrent.x);
      const yMin = Math.min(dragStart.y, dragCurrent.y);
      const yMax = Math.max(dragStart.y, dragCurrent.y);
      if (
        Math.abs(xMax - xMin) > Number.EPSILON &&
        Math.abs(yMax - yMin) > Number.EPSILON
      ) {
        onViewportChange({ xMin, xMax, yMin, yMax });
      }
    }

    setDragStart(null);
    setDragCurrent(null);
  };

  const globalTooltipPosition = useMemo(() => {
    if (!globalTooltip) return null;
    if (globalTooltip.plotId === plotId) return null;
    if (
      globalTooltip.x < activeExtent.xMin ||
      globalTooltip.x > activeExtent.xMax ||
      globalTooltip.y < activeExtent.yMin ||
      globalTooltip.y > activeExtent.yMax
    ) {
      return null;
    }

    return {
      tooltip: globalTooltip,
      posPct: {
        x: (xScale(globalTooltip.x) / outerWidth) * 100,
        y: (yScale(globalTooltip.y) / outerHeight) * 100,
      },
    };
  }, [activeExtent, globalTooltip, outerHeight, outerWidth, xScale, yScale]);

  const colorStops = useMemo(() => {
    if (!render.colorbar.colors.length) {
      return [];
    }

    const lastIndex = Math.max(render.colorbar.colors.length - 1, 1);

    return render.colorbar.colors.map((color, index) => ({
      offset: (index / lastIndex) * 100,
      color,
    }));
  }, [render.colorbar.colors]);

  return (
    <div className={plotStyles.figurePreview} ref={containerRef}>
      <svg
        className={styles.pseudocolorSvg}
        width={fittedSize.width}
        height={fittedSize.height}
        viewBox={`0 0 ${outerWidth} ${outerHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pseudocolor preview"
        ref={svgRef}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
            {colorStops.map((stop) => (
              <stop
                key={stop.offset}
                offset={`${stop.offset}%`}
                stopColor={stop.color}
              />
            ))}
          </linearGradient>
        </defs>

        <image
          href={imageHref}
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          preserveAspectRatio="none"
        />

        <g
          ref={xAxisRef}
          className={styles.pseudocolorAxis}
          transform={`translate(0, ${margin.top + innerHeight})`}
        />
        <g
          ref={yAxisRef}
          className={styles.pseudocolorAxis}
          transform={`translate(${margin.left}, 0)`}
        />

        <g
          className={styles.pseudocolorColorbar}
          transform={`translate(${margin.left + innerWidth + colorbarGap}, ${margin.top})`}
        >
          <rect
            width={colorbarWidth}
            height={innerHeight}
            rx={4}
            fill={`url(#${gradientId})`}
          />
          <g
            ref={colorbarAxisRef}
            className={styles.pseudocolorAxis}
            transform={`translate(${colorbarWidth + tickLabelGap}, 0)`}
          />
          <text
            className={styles.axisTitle}
            transform={`translate(${
              colorbarWidth + tickLabelGap + labelWidths.colorbarTicks + 16
            }, ${innerHeight / 2}) rotate(90)`}
            textAnchor="middle"
          >
            {colorbarLabel}
          </text>
        </g>

        <text
          className={styles.axisTitle}
          x={margin.left + innerWidth / 2}
          y={margin.top + innerHeight + 30 + titleSpace / 2 + 4}
          textAnchor="middle"
        >
          {xLabel}
        </text>
        <text
          className={styles.axisTitle}
          transform={`translate(${titleSpace / 2 + 4}, ${
            margin.top + innerHeight / 2
          }) rotate(-90)`}
          textAnchor="middle"
        >
          {yLabel}
        </text>

        {dragStart && dragCurrent && (
          <rect
            className={styles.zoomRect}
            x={Math.min(xScale(dragStart.x), xScale(dragCurrent.x))}
            y={Math.min(yScale(dragStart.y), yScale(dragCurrent.y))}
            width={Math.abs(xScale(dragStart.x) - xScale(dragCurrent.x))}
            height={Math.abs(yScale(dragStart.y) - yScale(dragCurrent.y))}
          />
        )}

        {globalTooltipPosition && (
          <g
            className={styles.globalMarker}
            transform={`translate(${(globalTooltipPosition.posPct.x / 100) * outerWidth}, ${(globalTooltipPosition.posPct.y / 100) * outerHeight})`}
          >
            <circle r={6} />
            <line x1={-10} x2={10} y1={0} y2={0} />
            <line x1={0} x2={0} y1={-10} y2={10} />
          </g>
        )}

        <rect
          className={styles.interactionLayer}
          x={margin.left}
          y={margin.top}
          width={innerWidth}
          height={innerHeight}
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
        />

        {isRefreshing && (
          <foreignObject
            x={outerWidth - 180}
            y={margin.top}
            width="170"
            height="40"
          >
            <div
              className={`${plotStyles.figureStatus} ${plotStyles.figureStatusFloating}`}
            >
              Refreshing…
            </div>
          </foreignObject>
        )}
      </svg>

    </div>
  );
};

export default PseudocolorPreview;
