// @vitest-environment jsdom
/**
 * Smoke test of the whole client against a fake API: the session loads, a
 * panel's data type and plot kind can be picked, and the chosen plot kind's
 * frame renders and syncs its settings back to the server.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { IServerSnapshot } from "./api/types";
import { DataType, PlotType } from "./state/schema";

const snapshot = (): IServerSnapshot => ({
  revision: 0,
  simulations: [{ id: "sim1", path: "demo:run" }],
  state: {
    layout: {
      global: {},
      layout: {
        type: "row",
        children: [
          {
            type: "tabset",
            children: [
              { type: "tab", id: "panel-1", component: "panel", name: "Panel" },
            ],
          },
        ],
      },
    },
    plotters: {
      "panel-1": {
        plotType: PlotType.None,
        dataType: DataType.None,
        useGlobalViewport: true,
        localViewport: null,
      },
    },
    timeline: { current: 0, min: 0, max: 1, step: 0.1 },
    globalViewport: null,
    globalLineViewports: {},
  },
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let puts: IServerSnapshot["state"][] = [];

beforeEach(() => {
  puts = [];
  // jsdom has no layout. flexlayout only mounts tab content once it measures
  // a non-empty area, so give every element a size.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
  );
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "api/state" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        puts.push(body.state);
        return json({
          ...snapshot(),
          revision: body.revision + 1,
          state: body.state,
        });
      }
      if (url === "api/state") return json(snapshot());
      if (url.endsWith("/summary")) {
        return json({ fields: null, particles: null, spectra: null });
      }
      if (url.endsWith("/fields")) {
        return json({
          fields: [{ name: "Bx", dims: ["x"] }],
          vectors: [],
          coords: { x: [0, 1] },
        });
      }
      return json({ error: `unexpected ${url}` }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("loads the session, then lets a panel choose and show a plot", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);

    // The session loads, and the sidebar lists the simulation.
    expect((await screen.findAllByText("demo:run")).length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole("button", { name: "fields" }));
    fireEvent.click(await screen.findByRole("button", { name: "1D plot" }));

    // The kind's frame renders: toolbar, and (no quantities yet) a hint.
    expect(await screen.findByRole("button", { name: "Zoom" })).toBeTruthy();
    expect(await screen.findByText("Nothing selected")).toBeTruthy();

    // The choice (with the kind's defaults and a simulation) reaches the server.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const plotter = puts.at(-1)?.plotters["panel-1"];
    expect(plotter).toMatchObject({
      dataType: DataType.Fields,
      plotType: PlotType.Line,
      simulationId: "sim1",
      lineConfig: { quantities: [], axis: "", slices: {} },
    });
    vi.useRealTimers();
  });

  it("offers to point the UI at another server when this one can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    render(<App />);

    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
    expect(screen.getByPlaceholderText("http://localhost:8765")).toBeTruthy();
    expect(screen.getByRole("button", { name: "connect" })).toBeTruthy();
  });
});
