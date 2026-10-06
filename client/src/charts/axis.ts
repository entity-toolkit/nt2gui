import { Axis, NumberValue, select } from "d3";

/** Draws a d3 axis into `group` in the app's axis style (see charts.css). */
export const drawAxis = (
  group: SVGGElement | null,
  axis: Axis<NumberValue>,
) => {
  if (!group) return;
  select(group).call(axis).attr("class", "chart-axis");
};

/** Horizontal grid lines at the ticks of a vertical axis. */
export const drawGrid = (
  group: SVGGElement | null,
  axis: Axis<NumberValue>,
  width: number,
) => {
  if (!group) return;
  select(group)
    .call(axis.tickSize(-width).tickFormat(() => ""))
    .attr("class", "chart-grid")
    .call((grid) => grid.select(".domain").remove());
};
