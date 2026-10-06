/**
 * Pure updates of the per-panel plot settings (`IUiState.plotters`). Each
 * returns its input unchanged (same object) when nothing changes, so React
 * skips re-rendering and the state sync skips a write.
 */
import { IJsonModel } from "flexlayout-react";
import { DataType, IPlotter, IPlotters, PlotType } from "./schema";

type LayoutNode = {
  id?: string;
  type?: string;
  component?: string;
  children?: LayoutNode[];
};

export const newPlotter = (): IPlotter => ({
  plotType: PlotType.None,
  dataType: DataType.None,
  useGlobalViewport: true,
  localViewport: null,
});

/** Ids of every panel tab in a flexlayout model. */
export const collectPanelIds = (layout: IJsonModel): Set<string> => {
  const panelIds = new Set<string>();
  const walk = (node: LayoutNode | undefined) => {
    if (!node) return;
    if (node.type === "tab" && node.component === "panel" && node.id) {
      panelIds.add(node.id);
    }
    node.children?.forEach(walk);
  };
  walk(layout.layout as LayoutNode);
  layout.borders?.forEach((border) => walk(border as LayoutNode));
  return panelIds;
};

/** One plotter per panel: add missing ones, drop those of closed panels. */
export const reconcilePlotters = (
  plotters: IPlotters,
  panelIds: Set<string>,
): IPlotters => {
  const missing = [...panelIds].filter((id) => !plotters[id]);
  const stale = Object.keys(plotters).filter((id) => !panelIds.has(id));
  if (!missing.length && !stale.length) return plotters;
  const next: IPlotters = { ...plotters };
  missing.forEach((id) => (next[id] = newPlotter()));
  stale.forEach((id) => delete next[id]);
  return next;
};

/** Merge `patch` (or `patch(plotter)`) into one plotter. */
export const updatePlotter = (
  plotters: IPlotters,
  id: string,
  patch: Partial<IPlotter> | ((plotter: IPlotter) => Partial<IPlotter>),
): IPlotters => {
  const existing = plotters[id];
  if (!existing) return plotters;
  const changes = typeof patch === "function" ? patch(existing) : patch;
  const changed = (Object.keys(changes) as (keyof IPlotter)[]).some(
    (key) => changes[key] !== existing[key],
  );
  return changed
    ? { ...plotters, [id]: { ...existing, ...changes } }
    : plotters;
};

/**
 * Choose what a panel plots. `defaults` (the plot kind's initial settings)
 * only fill settings the plotter doesn't have yet.
 */
export const setPlotType = (
  plotters: IPlotters,
  id: string,
  plotType: PlotType,
  defaults: Partial<IPlotter> = {},
): IPlotters =>
  updatePlotter(plotters, id, (existing) => {
    const filled = Object.fromEntries(
      Object.entries(defaults).filter(
        ([key]) => existing[key as keyof IPlotter] === undefined,
      ),
    );
    return { ...filled, plotType };
  });

/**
 * Every plot that shows data needs a simulation: keep a valid choice, else
 * take the first loaded one (or none if nothing is loaded).
 */
export const assignSimulations = (
  plotters: IPlotters,
  simulationIds: string[],
): IPlotters => {
  let next = plotters;
  for (const [id, plotter] of Object.entries(plotters)) {
    if (plotter.plotType === PlotType.None) continue;
    if (plotter.simulationId && simulationIds.includes(plotter.simulationId))
      continue;
    const simulationId = simulationIds[0];
    if (simulationId === plotter.simulationId) continue;
    // `undefined` is dropped when the state is serialized.
    next = updatePlotter(next, id, { simulationId });
  }
  return next;
};
