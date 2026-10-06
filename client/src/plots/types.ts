import { ComponentType } from "react";
import { DataType, IPlotter, PlotType } from "../state/schema";

/** What every plot kind's component gets. */
export interface PlotKindProps {
  nodeId: string;
  plotter: IPlotter;
  /** Always a loaded simulation, or null when none is loaded. */
  simulationId: string | null;
  time: number;
}

/**
 * One kind of plot (e.g. a 1D cut through fields). Adding a kind means a new
 * folder under plots/ and one entry in plots/registry.ts.
 */
export interface PlotKind {
  id: string;
  dataType: DataType;
  plotType: PlotType;
  /** Shown in the plot picker and the plot's footer. */
  label: string;
  /** Settings a plotter starts with when this kind is chosen. */
  defaults: Partial<IPlotter>;
  Plot: ComponentType<PlotKindProps>;
}
