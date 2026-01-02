import {
  axisBottom,
  axisLeft,
  axisRight,
  scaleLinear,
  select,
  NumberValue,
} from "d3";
import { useEffect, useId, useMemo, useRef } from "react";
import type { PseudocolorResponse } from "../services/renderService";

interface PseudocolorPreviewProps {
  render: PseudocolorResponse;
  isRefreshing: boolean;
}

const margin = { top: 16, right: 78, bottom: 44, left: 54 };
const colorbarWidth = 14;

const tickFormatter = (labels: string[]) =>
  function formatTick(_value: NumberValue, index: number) {
    return labels[index] ?? "";
  };

const PseudocolorPreview = ({
  render,
  isRefreshing,
}: PseudocolorPreviewProps) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const colorbarAxisRef = useRef<SVGGElement | null>(null);
  const gradientId = useId();

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

  const imageHref = useMemo(
    () => `data:image/png;base64,${render.image}`,
    [render.image],
  );

  useEffect(() => {
    const xScale = scaleLinear()
      .domain([render.extent.xMin, render.extent.xMax])
      .range([margin.left, margin.left + innerWidth]);

    const xAxis = axisBottom(xScale)
      .tickValues(render.xTicks.positions)
      .tickFormat(tickFormatter(render.xTicks.labels));

    const selection = select(xAxisRef.current!);
    selection.call(xAxis);
    selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
    selection.selectAll("line").attr("stroke", "#475569");
    selection.selectAll("path").attr("stroke", "#475569");
  }, [
    innerWidth,
    render.extent.xMax,
    render.extent.xMin,
    render.xTicks.labels,
    render.xTicks.positions,
  ]);

  useEffect(() => {
    const yScale = scaleLinear()
      .domain([render.extent.yMin, render.extent.yMax])
      .range([margin.top + innerHeight, margin.top]);

    const yAxis = axisLeft(yScale)
      .tickValues(render.yTicks.positions)
      .tickFormat(tickFormatter(render.yTicks.labels));

    const selection = select(yAxisRef.current!);
    selection.call(yAxis);
    selection.selectAll("text").attr("fill", "#cbd5e1").attr("font-size", 12);
    selection.selectAll("line").attr("stroke", "#475569");
    selection.selectAll("path").attr("stroke", "#475569");
  }, [
    innerHeight,
    render.extent.yMax,
    render.extent.yMin,
    render.yTicks.labels,
    render.yTicks.positions,
  ]);

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
    <div className="plot-figure__preview">
      <svg
        className="pseudocolor-svg"
        viewBox={`0 0 ${outerWidth} ${outerHeight}`}
        role="img"
        aria-label="Pseudocolor preview"
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
          className="pseudocolor-axis"
          transform={`translate(0, ${margin.top + innerHeight})`}
        />
        <g
          ref={yAxisRef}
          className="pseudocolor-axis"
          transform={`translate(${margin.left}, 0)`}
        />

        <g
          className="pseudocolor-colorbar"
          transform={`translate(${margin.left + innerWidth + 20}, ${margin.top})`}
        >
          <rect
            width={colorbarWidth}
            height={innerHeight}
            rx={4}
            fill={`url(#${gradientId})`}
          />
          <g
            ref={colorbarAxisRef}
            className="pseudocolor-axis"
            transform={`translate(${colorbarWidth + 8}, 0)`}
          />
        </g>

        {isRefreshing && (
          <foreignObject
            x={outerWidth - 180}
            y={margin.top}
            width="170"
            height="40"
          >
            <div className="plot-figure__status plot-figure__status--floating">
              Refreshing…
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
};

export default PseudocolorPreview;
