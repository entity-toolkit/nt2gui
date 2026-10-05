// @vitest-environment jsdom
/** Drag-to-pan in both charts (pointer events on their interaction layer). */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IImageRender, ILineRender } from "../api/types";
import ImageChart from "./ImageChart";
import LineChart from "./LineChart";

vi.mock("./useElementSize", () => ({
  useElementSize: () => ({ width: 800, height: 400 }),
}));

beforeEach(() => {
  // The svg sits at the page origin; positions are in client pixels.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 400 }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const drag = (
  target: Element,
  from: [number, number],
  to: [number, number],
) => {
  fireEvent.mouseDown(target, { clientX: from[0], clientY: from[1] });
  fireEvent.mouseMove(target, { clientX: to[0], clientY: to[1] });
  fireEvent.mouseUp(target, { clientX: to[0], clientY: to[1] });
};

const interactionLayer = (container: HTMLElement) => {
  const rects = container.querySelectorAll("svg > rect");
  return rects[rects.length - 1];
};

describe("LineChart panning", () => {
  const data: ILineRender = {
    axis: "x",
    coordinates: [0, 25, 50, 75, 100],
    series: [{ name: "f", values: [0, 1, 0, 1, 0] }],
    slices: {},
    timestamp: 0,
  };
  // Plot area: x from 64 to 782 px (margins 64 / 18) for the range [0, 100].
  const pixelsPerUnit = (800 - 64 - 18) / 100;

  const renderChart = (onPan: (range: { min: number; max: number }) => void) =>
    render(
      <LineChart
        data={data}
        range={{ min: 0, max: 100 }}
        zoomEnabled={false}
        onRangeChange={() => undefined}
        isRefreshing={false}
        pan={{ bounds: [-50, 150] }}
        onPan={onPan}
      />,
    );

  it("dragging right moves the window left by the dragged distance", () => {
    const onPan = vi.fn();
    const { container } = renderChart(onPan);
    drag(
      interactionLayer(container),
      [400, 100],
      [400 + 20 * pixelsPerUnit, 100],
    );

    const range = onPan.mock.calls[0][0];
    expect(range.min).toBeCloseTo(-20);
    expect(range.max).toBeCloseTo(80);
  });

  it("stops at the bounds", () => {
    const onPan = vi.fn();
    const { container } = renderChart(onPan);
    drag(
      interactionLayer(container),
      [400, 100],
      [400 + 500 * pixelsPerUnit, 100],
    );
    expect(onPan.mock.calls[0][0].min).toBeCloseTo(-50);
  });

  it("ignores clicks", () => {
    const onPan = vi.fn();
    const { container } = renderChart(onPan);
    drag(interactionLayer(container), [400, 100], [401, 100]);
    expect(onPan).not.toHaveBeenCalled();
  });
});

describe("ImageChart panning", () => {
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

  const renderChart = (
    pan: { x: boolean; y: boolean },
    onPan: (w: unknown) => void,
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
        pan={pan}
        onPan={onPan}
      />,
    );

  it("pans both axes; dragging down shows what is above", () => {
    const onPan = vi.fn();
    const { container } = renderChart({ x: true, y: true }, onPan);
    drag(interactionLayer(container), [300, 200], [250, 250]);

    const window = onPan.mock.calls[0][0];
    expect(window.xMin).toBeGreaterThan(0); // dragged left: view moves right
    expect(window.yMin).toBeGreaterThan(0); // dragged down: view moves up
    expect(window.xMax - window.xMin).toBeCloseTo(10);
    expect(window.yMax - window.yMin).toBeCloseTo(10);
  });

  it("leaves an axis that isn't panned alone", () => {
    const onPan = vi.fn();
    const { container } = renderChart({ x: true, y: false }, onPan);
    drag(interactionLayer(container), [300, 200], [250, 250]);

    const window = onPan.mock.calls[0][0];
    expect(window.yMin).toBeCloseTo(0);
    expect(window.yMax).toBeCloseTo(10);
  });
});

describe("after a pan is released", () => {
  const image: IImageRender = {
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
  const imageChart = (data: IImageRender) => (
    <ImageChart
      data={data}
      xAxis={{ title: "x" }}
      yAxis={{ title: "y" }}
      colorbarTitle="f"
      zoomEnabled={false}
      onZoom={() => undefined}
      isRefreshing={false}
      pan={{ x: true, y: false }}
      onPan={() => undefined}
    />
  );

  it("the image stays where it was dragged until the new one arrives", () => {
    const { container, rerender } = render(imageChart(image));
    const img = () => container.querySelector("image")!;
    const left = Number(img().getAttribute("x"));
    drag(interactionLayer(container), [300, 200], [250, 200]);

    // Dragged 50 px left, and kept there (not translated, but placed).
    expect(Number(img().getAttribute("x"))).toBeCloseTo(left - 50);
    expect(img().getAttribute("transform")).toBeNull();

    rerender(
      imageChart({ ...image, extent: { ...image.extent, xMin: 1, xMax: 11 } }),
    );
    expect(Number(img().getAttribute("x"))).toBeCloseTo(left);
  });

  it("histogram lines stay where they were dragged until re-binned", () => {
    const data: ILineRender = {
      axis: "x",
      coordinates: [0, 50, 100],
      series: [{ name: "f", values: [1, 2, 2] }],
      slices: {},
      timestamp: 0,
    };
    const chart = (lines: ILineRender) => (
      <LineChart
        data={lines}
        range={null}
        zoomEnabled={false}
        onRangeChange={() => undefined}
        isRefreshing={false}
        step
        pan={{}}
        onPan={() => undefined}
      />
    );
    const { container, rerender } = render(chart(data));
    const start = () =>
      Number(
        /^M([-\d.]+)/.exec(
          container.querySelector("path[class*=series]")!.getAttribute("d")!,
        )![1],
      );
    const before = start();
    drag(interactionLayer(container), [400, 100], [440, 100]);
    expect(start()).toBeCloseTo(before + 40);

    rerender(chart({ ...data, coordinates: [-20, 30, 80] }));
    expect(start()).toBeCloseTo(before);
  });
});
