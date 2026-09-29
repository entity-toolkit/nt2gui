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
  /** Custom quantities (e.g. "f + g") offered alongside the fields. */
  expressions?: string[];
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
  /** Custom quantities offered alongside the fields; selected ones are also in `quantities`. */
  expressions?: string[];
}

/** How a particle quantity is binned: in A, log10(A), or sign(A)·|A|^p. */
export type ParticleScale = "linear" | "log" | "power";

export interface IParticleAxis {
  /** Built-in quantity (x, ux, gamma, energy, …) or an expression. */
  quantity: string;
  scale: ParticleScale;
  /** Exponent p of the power scale (default 0.5). */
  power?: number;
  /** Number of bins (default 100). */
  bins?: number;
  /** Binned range in data units; unset sides follow the data. */
  min?: number;
  max?: number;
}

export interface IParticleSeries {
  /** Species indices summed into one line; empty means all species. */
  species: number[];
}

/** 1D weighted histogram, e.g. the energy spectrum of each species. */
export interface IParticleHistogramConfig {
  x: IParticleAxis;
  series: IParticleSeries[];
  yScale?: "linear" | "log";
  yMin?: number;
  yMax?: number;
  expressions?: string[];
}

/** 2D weighted histogram (phase space) of the selected species. */
export interface IParticlePhaseConfig {
  x: IParticleAxis;
  y: IParticleAxis;
  /** Empty means all species. */
  species?: number[];
  colorScale?: "linear" | "log";
  vmin?: number;
  vmax?: number;
  colorMap?: string;
  expressions?: string[];
}

export interface IParticleSpecies {
  index: number;
  label: string;
  mass: number;
}

/** A simulation's particle species and built-in quantities (see server/particles.py). */
export interface IParticleMetadata {
  species: IParticleSpecies[];
  quantities: { name: string; defaultScale: ParticleScale }[];
}

export const DEFAULT_PARTICLE_BINS = 100;
export const DEFAULT_PARTICLE_POWER = 0.5;

export const defaultParticleHistogramConfig: IParticleHistogramConfig = {
  x: { quantity: "gamma", scale: "log" },
  series: [{ species: [] }],
  yScale: "log",
};

export const defaultParticlePhaseConfig: IParticlePhaseConfig = {
  x: { quantity: "x", scale: "linear", bins: 200 },
  y: { quantity: "ux", scale: "linear", bins: 200 },
  species: [],
  colorScale: "log",
  colorMap: "viridis",
};

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
  particleHistogramConfig?: IParticleHistogramConfig;
  particlePhaseConfig?: IParticlePhaseConfig;
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
