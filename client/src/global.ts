import { IJsonModel } from "flexlayout-react";

export enum DataType {
  None = "none",
  Fields = "fields",
  Particles = "particles",
}

export enum PlotType {
  None = "none",
  Line = "line",
  Scatter = "scatter",
  Pseudocolor = "pseudocolor",
}

export interface ITimeline {
  current: number;
  min: number;
  max: number;
  step: number;
}

export interface IPseudocolorConfig {
  field: string;
  xCoordinate: string;
  yCoordinate: string;
  vmin?: number;
  vmax?: number;
  colorMap: string;
  /** Coordinate value at which each dim beyond x/y is sliced (3D fields). */
  slices?: Record<string, number>;
}

export interface IZoomWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** A zoom window along one coordinate (1D plots). */
export interface IRange {
  min: number;
  max: number;
}

export interface ILineConfig {
  /** Field names ("Ex") or vector names ("E", plots all its components). */
  quantities: string[];
  /** Coordinate to plot against; "" means the first one available. */
  axis: string;
  /** Coordinate value at which each other spatial dimension is sliced. */
  slices: Record<string, number>;
  /** Fixed value-axis limits; either may be left unset (auto). */
  yMin?: number;
  yMax?: number;
}

export interface ITooltipDatum {
  x: number;
  y: number;
  color: string;
  value?: number;
  plotId: string;
}

export interface IPlotter {
  plotType: PlotType;
  dataType: DataType;
  simulationId?: string;
  pseudocolorConfig?: IPseudocolorConfig;
  localViewport?: IZoomWindow | null;
  useGlobalViewport?: boolean;
  lineConfig?: ILineConfig;
  lineViewport?: IRange | null;
}

export interface IPlotters {
  [key: string]: IPlotter;
}

export interface IUiState {
  layout: IJsonModel;
  plotters: IPlotters;
  timeline: ITimeline;
  globalViewport: IZoomWindow | null;
  /** Synced 1D zoom per coordinate: only line plots along the same axis share it. */
  globalLineViewports: Record<string, IRange>;
}

export interface ISimulation {
  id: string;
  path: string;
}

export const defaultPseudocolorConfig: IPseudocolorConfig = {
  field: "",
  xCoordinate: "x",
  yCoordinate: "y",
  vmin: undefined,
  vmax: undefined,
  colorMap: "viridis",
};

export const defaultLineConfig: ILineConfig = {
  quantities: [],
  axis: "",
  slices: {},
};

/** A simulation's fields, as described by the server (see server/fields.py). */
export interface IFieldMetadata {
  fields: { name: string; dims: string[] }[];
  vectors: { name: string; components: string[] }[];
  /** Coordinate values of every spatial dimension used by some field. */
  coords: Record<string, number[]>;
}

/** What the server returns for every state read or change. */
export interface IServerSnapshot {
  revision: number;
  state: IUiState;
  simulations: ISimulation[];
}

/** A saved session file (server-side or downloaded); see server/schema.py. */
export interface ISessionDocument {
  schemaVersion: number;
  state: IUiState;
  simulations: ISimulation[];
}

/** Result of a session save/load/import on the server. */
export interface ISessionCommandResult extends IServerSnapshot {
  /** Absolute path on the server machine, for server-side saves/loads. */
  path?: string;
  /** Simulations referenced by a loaded session that could not be re-opened. */
  warnings?: string[];
}
