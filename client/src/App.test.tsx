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
// What GET /fields returns; tests needing 2D fields replace it.
let fieldMetadata: unknown;

beforeEach(() => {
  puts = [];
  fieldMetadata = {
    fields: [{ name: "Bx", dims: ["x"] }],
    vectors: [],
    coords: { x: [0, 1] },
  };
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
      if (url.endsWith("/fields")) return json(fieldMetadata);
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
    expect(
      await screen.findByRole("button", { name: "Zoom area" }),
    ).toBeTruthy();
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

  it("picks the plot kind below the data type, which can still be changed", async () => {
    render(<App />);
    const fields = await screen.findByRole("button", { name: "fields" });
    expect(fields.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "1D plot" })).toBeNull();

    fireEvent.click(fields);
    // The data step stays (marked chosen) and the plot kinds appear below it.
    expect(fields.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("button", { name: "1D plot" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /scatter/ })).toBeNull();
    // These fields are 1D, so a 2D plot can't be made from them.
    const pseudocolor = await screen.findByRole("button", {
      name: "2D pseudocolor",
    });
    await vi.waitFor(() =>
      expect((pseudocolor as HTMLButtonElement).disabled).toBe(true),
    );
    expect(pseudocolor.getAttribute("title")).toBe(
      "This simulation's fields are 1D",
    );

    // Switching the data type swaps the kinds; clicking it again goes back.
    fireEvent.click(screen.getByRole("button", { name: "particles" }));
    expect(
      await screen.findByRole("button", { name: "1D histogram" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1D plot" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "particles" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "1D histogram" })).toBeNull(),
    );
    expect(screen.queryByText(/Right-click a plot/)).toBeNull();
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
    // The slider moves over output indices: index 3 is t = 0.3.
    fireEvent.change(slider, { target: { value: "3" } });
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

    // Renaming: a taken name is refused, a new one renames every reference.
    fireEvent.click(
      within(list).getByRole("button", { name: "Rename region-02" }),
    );
    const input = within(list).getByRole("textbox", { name: "Region name" });
    fireEvent.change(input, { target: { value: "region-01" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(list).getByRole("alert").textContent).toBe(
      "Another region is already called 'region-01'",
    );
    fireEvent.change(input, { target: { value: "upstream" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await within(list).findByText("upstream")).toBeTruthy();

    fireEvent.click(
      within(list).getByRole("button", { name: "Delete region-01" }),
    );
    expect(within(list).queryByText("region-01")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const state = puts.at(-1)!;
    expect(state.regions?.map((r) => r.name)).toEqual(["upstream"]);
    expect(state.plotters["panel-1"].particlePhaseConfig?.regions).toEqual([
      "upstream",
    ]);
    vi.useRealTimers();
  });

  it("hides regions on 2D plots until shown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const saved = snapshot();
    saved.state.plotters["panel-1"] = {
      dataType: DataType.Fields,
      plotType: PlotType.Pseudocolor,
      simulationId: "sim1",
      pseudocolorConfig: {
        field: "",
        xCoordinate: "x",
        yCoordinate: "y",
        colorMap: "viridis",
      },
    };
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const fake = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      url === "api/state" && init?.method !== "PUT"
        ? json(saved)
        : fake(url, init),
    );
    render(<App />);

    const toggle = await screen.findByRole("checkbox", {
      name: "Show regions",
    });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(puts.at(-1)?.plotters["panel-1"].showRegions).toBe(true);
    vi.useRealTimers();
  });

  it("renames a simulation, and titles panels once several are loaded", async () => {
    const two = snapshot();
    two.simulations = [
      { id: "sim1", path: "/data/shock", name: "shock" },
      { id: "sim2", path: "/data/shock2", name: "shock-01" },
    ];
    two.state.plotters["panel-1"] = {
      plotType: PlotType.Line,
      dataType: DataType.Fields,
      simulationId: "sim2",
      lineConfig: { quantities: [], axis: "", slices: {} },
    };
    const renames: unknown[] = [];
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const fake = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "api/simulations/sim2" && init?.method === "PATCH") {
        const { name } = JSON.parse(String(init.body));
        renames.push(name);
        if (name === "shock") {
          return json(
            { error: "Another simulation is already called 'shock'" },
            409,
          );
        }
        two.simulations[1] = { ...two.simulations[1], name };
        two.revision += 1;
        return json(two);
      }
      if (url === "api/state" && init?.method !== "PUT") return json(two);
      return fake(url, init);
    });
    render(<App />);

    // The panel's simulation, by name, at its top.
    expect(
      await screen.findByRole("heading", { name: "shock-01" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rename shock-01" }));
    const input = screen.getByRole("textbox", { name: "Simulation name" });
    fireEvent.change(input, { target: { value: "shock" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/already called/);

    fireEvent.change(input, { target: { value: " wide box " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByRole("heading", { name: "wide box" }),
    ).toBeTruthy();
    expect(renames).toEqual(["shock", "wide box"]);
  });

  it("doesn't title panels when only one simulation is loaded", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "fields" }));
    fireEvent.click(await screen.findByRole("button", { name: "1D plot" }));
    await screen.findByRole("button", { name: "Zoom area" });
    expect(screen.queryByRole("heading", { name: "demo:run" })).toBeNull();
  });

  it("saves and loads from the State menu; settings show the connection", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "State" }));
    expect(screen.getByRole("menuitem", { name: "Load" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
    expect(screen.queryByRole("menu")).toBeNull();
    const save = screen.getByRole("dialog");
    fireEvent.click(within(save).getByRole("button", { name: /close/i }));

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const connection = screen.getByLabelText("Current connection");
    expect(within(connection).getByText(/\/api$/)).toBeTruthy();
    expect(
      within(connection).getByText("the server that served this page"),
    ).toBeTruthy();
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
