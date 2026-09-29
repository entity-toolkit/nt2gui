/**
 * The synced UI state, as stored by the server. Mirrors
 * `nt2gui/session/schema.py`: change both together (and bump SCHEMA_VERSION
 * there for breaking changes).
 */
import { IJsonModel } from "flexlayout-react";

export enum DataType {
  None = "none",
  Fields = "fields",
  Particles = "particles",
}

/** For particles, `Line` is a 1D histogram and `Pseudocolor` a phase plot. */
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

export type ColorScale = "linear" | "log";

export interface IPseudocolorConfig {
  /** Field name or expression. */
  field: string;
  xCoordinate: string;
  yCoordinate: string;
  vmin?: number;
  vmax?: number;
  colorMap: string;
  /** Log colors leave values <= 0 transparent (default linear). */
  colorScale?: ColorScale;
  /** Coordinate value at which each dim beyond x/y is sliced (3D fields). */
  slices?: Record<string, number>;
  /** Custom quantities (e.g. "f + g") offered alongside the fields. */
  expressions?: string[];
}

export interface ILineConfig {
  /** Field names ("Ex"), vector names ("E": all its components), or expressions. */
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

export const DEFAULT_PARTICLE_BINS = 100;
export const DEFAULT_PARTICLE_POWER = 0.5;

export interface IParticleAxis {
  /** Built-in quantity (x, ux, gamma, energy, …) or an expression. */
  quantity: string;
  scale: ParticleScale;
  /** Exponent p of the power scale (default DEFAULT_PARTICLE_POWER). */
  power?: number;
  /** Number of bins (default DEFAULT_PARTICLE_BINS). */
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
  yScale?: ColorScale;
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
  colorScale?: ColorScale;
  vmin?: number;
  vmax?: number;
  colorMap?: string;
  expressions?: string[];
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

export type IPlotters = Record<string, IPlotter>;

export interface IUiState {
  layout: IJsonModel;
  plotters: IPlotters;
  timeline: ITimeline;
  globalViewport: IZoomWindow | null;
  /** Synced 1D zoom per coordinate: only line plots along the same axis share it. */
  globalLineViewports: Record<string, IRange>;
  /** Whether the simulations sidebar is folded away. */
  sidebarCollapsed?: boolean;
}

export interface ISimulation {
  id: string;
  path: string;
}
