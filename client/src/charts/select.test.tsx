// @vitest-environment jsdom
/** Region selection (range, box, band, lasso) and region outlines in both charts. */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IImageRender, ILineRender } from "../api/types";
import { ChartSelection } from "../state/regions";
import ImageChart, { ImageSelect } from "./ImageChart";
import LineChart from "./LineChart";

vi.mock("./useElementSize", () => ({
  useElementSize: () => ({ width: 800, height: 400 }),
}));

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 400 }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const interactionLayer = (container: HTMLElement) => {
  const rects = container.querySelectorAll("svg > rect");
  return rects[rects.length - 1];
};

const path = (target: Element, points: [number, number][]) => {
  const [first, ...rest] = points;
  fireEvent.mouseDown(target, { clientX: first[0], clientY: first[1] });
  for (const [x, y] of rest)
    fireEvent.mouseMove(target, { clientX: x, clientY: y });
  const last = points[points.length - 1];
  fireEvent.mouseUp(target, { clientX: last[0], clientY: last[1] });
};

describe("LineChart selection", () => {
  const data: ILineRender = {
    axis: "x",
    coordinates: [0, 50, 100],
    series: [{ name: "f", values: [0, 1, 0] }],
    slices: {},
    timestamp: 0,
  };
  // Plot area: x from 64 to 782 px for [0, 100].
  const px = (x: number) => 64 + (x / 100) * (800 - 64 - 18);

  it("selects a range instead of zooming, and outlines regions", () => {
    const onSelect = vi.fn();
    const onRangeChange = vi.fn();
    const { container } = render(
      <LineChart
        data={data}
        range={null}
        zoomEnabled={false}
        onRangeChange={onRangeChange}
        isRefreshing={false}
        selectEnabled
        onSelect={onSelect}
        regions={[{ name: "region-01", x: [10, 20] }]}
      />,
    );
    path(interactionLayer(container), [
      [px(60), 100],
      [px(30), 100],
    ]);

    expect(onRangeChange).not.toHaveBeenCalled();
    const range = onSelect.mock.calls[0][0];
    expect(range.min).toBeCloseTo(30);
    expect(range.max).toBeCloseTo(60);

    const outline = container.querySelector(".chart-region rect");
    expect(Number(outline?.getAttribute("x"))).toBeCloseTo(px(10));
    expect(Number(outline?.getAttribute("width"))).toBeCloseTo(px(20) - px(10));
    expect(container.querySelector(".chart-region text")?.textContent).toBe(
      "region-01",
    );
  });
});

describe("ImageChart selection", () => {
  const data: IImageRender = {
    image: "",
    imageSize: { width: 2, height: 2 },
    extent: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    colorbar: {
      vmin: 0,
      vmax: 1,
      scale: "linear",
      colors: ["#000000", "#ffffff"],
    },
    timestamp: 0,
  };
  // Plot area: x 72..684 px, y 14..352 px (top = 10), for [0, 10]².
  const px = (x: number) => 72 + (x / 10) * 612;
  const py = (y: number) => 352 - (y / 10) * 338;

  const renderChart = (
    select: ImageSelect,
    onSelect: (s: ChartSelection) => void,
  ) =>
    render(
      <ImageChart
        data={data}
        xAxis={{ title: "x" }}
        yAxis={{ title: "y" }}
        colorbarTitle="f"
        zoomEnabled={false}
        onZoom={() => undefined}
        isRefreshing={false}
        // Selecting takes precedence over panning.
        pan={{ x: true, y: true }}
        onPan={() => {
          throw new Error("panned while selecting");
        }}
        select={select}
        onSelect={onSelect}
        regions={[
          { name: "region-01", x: [1, 2] },
          {
            name: "region-02",
            polygon: [
              [5, 5],
              [6, 5],
              [5, 6],
            ],
          },
        ]}
      />,
    );

  it("selects a box", () => {
    const onSelect = vi.fn();
    const { container } = renderChart(
      { shape: "box", x: true, y: true },
      onSelect,
    );
    path(interactionLayer(container), [
      [px(2), py(3)],
      [px(4), py(8)],
    ]);
    const box = onSelect.mock.calls[0][0];
    expect(box.kind).toBe("box");
    expect(box.xMin).toBeCloseTo(2);
    expect(box.xMax).toBeCloseTo(4);
    expect(box.yMin).toBeCloseTo(3);
    expect(box.yMax).toBeCloseTo(8);
  });

  it("selects a band spanning the axis that isn't spatial", () => {
    const onSelect = vi.fn();
    const { container } = renderChart(
      { shape: "box", x: true, y: false },
      onSelect,
    );
    // Hardly any vertical movement: still a band.
    path(interactionLayer(container), [
      [px(2), py(5)],
      [px(4), py(5)],
    ]);
    const box = onSelect.mock.calls[0][0];
    expect(box.xMin).toBeCloseTo(2);
    expect(box.xMax).toBeCloseTo(4);
    expect(box.yMin).toBeCloseTo(0);
    expect(box.yMax).toBeCloseTo(10);
  });

  it("draws a lasso in data units, ignoring tiny ones", () => {
    const onSelect = vi.fn();
    const { container } = renderChart(
      { shape: "lasso", x: true, y: true },
      onSelect,
    );
    path(interactionLayer(container), [
      [px(1), py(1)],
      [px(4), py(1)],
      [px(4), py(4)],
      [px(1), py(4)],
    ]);
    const lasso = onSelect.mock.calls[0][0];
    expect(lasso.kind).toBe("lasso");
    expect(lasso.points).toHaveLength(4);
    expect(lasso.points[2][0]).toBeCloseTo(4);
    expect(lasso.points[2][1]).toBeCloseTo(4);

    path(interactionLayer(container), [
      [px(1), py(1)],
      [px(1) + 3, py(1)],
      [px(1) + 3, py(1) + 3],
    ]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("outlines saved regions: bands span the free axis", () => {
    const { container } = renderChart(
      { shape: "box", x: true, y: true },
      () => undefined,
    );
    const band = container.querySelector(".chart-region rect");
    expect(Number(band?.getAttribute("x"))).toBeCloseTo(px(1));
    expect(Number(band?.getAttribute("height"))).toBeCloseTo(338);
    const lasso = container.querySelector(".chart-region path");
    expect(lasso?.getAttribute("d")).toMatch(/^M.*Z$/);
  });
});
