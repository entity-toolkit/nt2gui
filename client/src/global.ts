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

export interface IPlotter {
  plotType: PlotType;
  dataType: DataType;
  pseudocolorConfig?: IPseudocolorConfig;
}

export interface IPlotters {
  [key: string]: IPlotter;
}

export interface IUiState {
  layout: IJsonModel;
  plotters: IPlotters;
  timeline: ITimeline;
}

export interface ISimulation {
  id: string;
  path: string;
}

export const defaultPseudocolorConfig: IPseudocolorConfig = {
  field: "",
  xCoordinate: "",
  yCoordinate: "",
  vmin: undefined,
  vmax: undefined,
  colorMap: "viridis",
};
