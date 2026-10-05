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
  within,
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

  it("keeps the playback speed and the folded timeline in the session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    const footer = await screen.findByRole("contentinfo", {
      name: "Global timeline",
    });

    fireEvent.change(within(footer).getByLabelText("Playback speed"), {
      target: { value: "30" },
    });
    fireEvent.click(
      within(footer).getByRole("button", { name: "Collapse timeline" }),
    );
    // Folded: the slider goes, playback stays.
    expect(within(footer).queryByRole("slider")).toBeNull();
    expect(within(footer).getByRole("button", { name: "Play" })).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(puts.at(-1)).toMatchObject({
      playbackFps: 30,
      timelineCollapsed: true,
    });
    vi.useRealTimers();
  });

  it("gives an unsynced panel its own timeline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "fields" }));
    fireEvent.click(await screen.findByRole("button", { name: "1D plot" }));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Sync time" }));
    const panelTimeline = await screen.findByLabelText("Panel timeline");
    const slider = within(panelTimeline).getByRole("slider");
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.mouseUp(slider);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(puts.at(-1)?.plotters["panel-1"]).toMatchObject({
      syncTime: false,
      localTime: 0.3,
    });
    // The global time is untouched.
    expect(puts.at(-1)?.timeline.current).toBe(0);

    // Syncing again drops the panel's timeline.
    fireEvent.click(screen.getByRole("checkbox", { name: "Sync time" }));
    expect(screen.queryByLabelText("Panel timeline")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(puts.at(-1)?.plotters["panel-1"].syncTime).toBe(true);
    expect(puts.at(-1)?.plotters["panel-1"].localTime).toBeUndefined();
    vi.useRealTimers();
  });

  it("lists saved regions; deleting one unselects it in particle plots", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saved = snapshot();
    saved.state.regions = [
      { name: "region-01", ranges: { x: { min: 0, max: 0.5 } } },
      {
        name: "region-02",
        polygon: {
          x: "x",
          y: "y",
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      },
    ];
    saved.state.plotters["panel-1"].particlePhaseConfig = {
      x: { quantity: "x", scale: "linear" },
      y: { quantity: "ux", scale: "linear" },
      regions: ["region-01", "region-02"],
    };
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const fake = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "api/state" && init?.method !== "PUT"
        ? json(saved)
        : fake(url, init),
    );
    render(<App />);

    const list = await screen.findByRole("region", { name: "Regions" });
    expect(within(list).getByText("x ∈ [0, 0.5]")).toBeTruthy();
    expect(within(list).getByText("lasso in x–y (3 points)")).toBeTruthy();

    fireEvent.click(
      within(list).getByRole("button", { name: "Delete region-01" }),
    );
    expect(within(list).queryByText("region-01")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const state = puts.at(-1)!;
    expect(state.regions?.map((r) => r.name)).toEqual(["region-02"]);
    expect(state.plotters["panel-1"].particlePhaseConfig?.regions).toEqual([
      "region-02",
    ]);
    vi.useRealTimers();
  });

  it("hides regions on 2D plots until shown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "fields" }));
    fireEvent.click(await screen.findByRole("button", { name: "2D pseudocolor" }));

    const toggle = await screen.findByRole("checkbox", {
      name: "Show regions",
    });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(puts.at(-1)?.plotters["panel-1"].showRegions).toBe(true);
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

  it("plays through time, waiting for pending renders, and stops at the end", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { beginRender } = await import("./state/renderActivity");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));

    // ≤ 2 fps by default: one step after 500 ms.
    const time = () => screen.getByText(/Time:/).textContent;
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(time()).toMatch(/0\.1\b/);

    // A pending render holds playback.
    const done = beginRender();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(time()).toMatch(/0\.1\b/);
    act(() => done());

    // Runs to the end (t = 1), stops there, and syncs the final time to the server.
    for (let i = 0; i < 40; i++) {
      await act(() => vi.advanceTimersByTimeAsync(250));
    }
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    await vi.waitFor(() => expect(puts.at(-1)?.timeline.current).toBe(1));
    vi.useRealTimers();
  });
});
