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

/** A lasso: a closed polygon over two spatial coordinates (data units). */
export interface IRegionPolygon {
  x: string;
  y: string;
  points: [number, number][];
}

/**
 * A named spatial selection (region-01, …). Particles inside every
 * constraint belong to it; particle plots can filter by regions.
 */
export interface IRegion {
  name: string;
  /** Inclusive range per spatial coordinate (boxes and bands). */
  ranges?: Record<string, IRange>;
  polygon?: IRegionPolygon;
  /** Outline color, fixed when saved so renaming keeps it (CSS hex). */
  color?: string;
}

export type ColorScale = "linear" | "log";

/**
 * A value scale: linear, log10 (values <= 0 can't be shown), or the
 * sign-preserving power stretch sign(A)·|A|^p (a "symlog" for data of either
 * sign).
 */
export type ScaleKind = "linear" | "log" | "power";

export const DEFAULT_SCALE_POWER = 0.5;

export interface IPseudocolorConfig {
  /** Field name or expression. */
  field: string;
  xCoordinate: string;
  yCoordinate: string;
  vmin?: number;
  vmax?: number;
  colorMap: string;
  /** Log colors leave values <= 0 transparent (default linear). */
  colorScale?: ScaleKind;
  /** Exponent p of the power color scale (default DEFAULT_SCALE_POWER). */
  colorPower?: number;
  /** Coordinate value at which each dim beyond x/y is sliced (3D fields). */
  slices?: Record<string, number>;
  /** Applied along x and/or y. */
  smoothing?: ISmoothing;
  /** Custom quantities (e.g. "f + g") offered alongside the fields. */
  expressions?: string[];
}

/** Boxcar width per coordinate, in that coordinate's units (absent: no smoothing). */
export type ISmoothing = Record<string, number>;

/**
 * A named custom quantity (`edotb = Ex*Bx + …`), usable by name in every plot
 * (of its kind) and in other variables.
 */
export interface IVariable {
  name: string;
  expression: string;
}

/** Which data a variable is defined over. */
export type VariableKind = "fields" | "particles";

export interface ILineConfig {
  /** Field names ("Ex"), vector names ("E": all its components), or expressions. */
  quantities: string[];
  /** Coordinate to plot against; "" means the first one available. */
  axis: string;
  /** Coordinate value at which each other spatial dimension is sliced. */
  slices: Record<string, number>;
  /** Applied along the plotted axis. */
  smoothing?: ISmoothing;
  /** Fixed value-axis limits; either may be left unset (auto). */
  yMin?: number;
  yMax?: number;
  /** Value-axis scale (display only, default linear) and its power-scale exponent. */
  yScale?: ScaleKind;
  yPower?: number;
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
  /** Saved region names; only particles inside any of them count (empty: no filter). */
  regions?: string[];
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
  /** Saved region names (union); empty means no spatial filter. */
  regions?: string[];
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
  /** false: the panel has its own time (`localTime`) instead of the global one (default true). */
  syncTime?: boolean;
  localTime?: number;
  localPlaybackFps?: number;
  /** Outline saved regions (default: on for 1D plots, off for 2D). */
  showRegions?: boolean;
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
  /** Whether the global timeline is folded down to its play button. */
  timelineCollapsed?: boolean;
  /** Global playback speed limit in frames per second (≤ MAX_PLAYBACK_FPS on the server). */
  playbackFps?: number;
  /** Distraction-free view: only the plots (menus, tabs, tools, timeline hidden). */
  focusMode?: boolean;
  /** Spatial selections particle plots can filter by. Names are unique. */
  regions?: IRegion[];
  /** Named custom quantities shared by every plot of fields / of particles. */
  fieldVariables?: IVariable[];
  particleVariables?: IVariable[];
}

export interface ISimulation {
  id: string;
  path: string;
  /** Display name, unique among the loaded simulations (set by the server). */
  name?: string;
}
