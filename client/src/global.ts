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
}

export interface IZoomWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
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
}

export interface IPlotters {
  [key: string]: IPlotter;
}

export interface IUiState {
  layout: IJsonModel;
  plotters: IPlotters;
  timeline: ITimeline;
  globalViewport: IZoomWindow | null;
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
