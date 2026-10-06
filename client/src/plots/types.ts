import { ComponentType } from "react";
import { IconType } from "react-icons";
import { IFieldMetadata } from "../api/types";
import { DataType, IPlotter, PlotType } from "../state/schema";

/** What the plot picker knows when offering plot kinds. */
export interface PickerContext {
  /** Fields of the simulation the panel would show (null while unknown). */
  fieldMetadata: IFieldMetadata | null;
}

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
  /** Shown in the plot picker. */
  label: string;
  /** One line under the label in the plot picker. */
  description: string;
  Icon: IconType;
  /** Why this kind can't be picked (e.g. 1D data for a 2D plot), or null. */
  unavailable?: (context: PickerContext) => string | null;
  /** Settings a plotter starts with when this kind is chosen. */
  defaults: Partial<IPlotter>;
  Plot: ComponentType<PlotKindProps>;
}
