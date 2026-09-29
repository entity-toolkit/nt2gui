/** Shapes of the server's responses (see `nt2gui/api/*` and `nt2gui/plots/*`). */
import {
  ColorScale,
  ISimulation,
  IUiState,
  ParticleScale,
} from "../state/schema";

/** What the server returns for every state read or change. */
export interface IServerSnapshot {
  revision: number;
  state: IUiState;
  simulations: ISimulation[];
}

/** A saved session file (server-side or downloaded). */
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

// --- metadata ---------------------------------------------------------------

export interface IFieldMetadata {
  fields: { name: string; dims: string[] }[];
  vectors: { name: string; components: string[] }[];
  /** Coordinate values of every spatial dimension used by some field. */
  coords: Record<string, number[]>;
}

export interface IParticleSpecies {
  index: number;
  label: string;
  /** Null when the simulation doesn't record it (no Entity .info file). */
  mass: number | null;
}

export interface IParticleMetadata {
  species: IParticleSpecies[];
  quantities: { name: string; defaultScale: ParticleScale }[];
}

export interface ITimesSummary {
  count: number;
  min: number;
  max: number;
}

/** A gridded dataset (fields, spectra) at a glance. */
export interface IGridSummary {
  axes: { name: string; size: number; min?: number; max?: number }[];
  quantities: string[];
  times: ITimesSummary | null;
}

/** What a simulation contains, for the sidebar. */
export interface ISimulationSummary {
  fields: IGridSummary | null;
  particles: {
    species: (IParticleSpecies & { count: number })[];
    /** Time of the output the counts are from. */
    countsAt: number;
    quantities: string[];
    times: ITimesSummary | null;
  } | null;
  spectra: IGridSummary | null;
}

// --- plots ------------------------------------------------------------------

export interface ILineRender {
  axis: string;
  coordinates: (number | null)[];
  series: { name: string; values: (number | null)[] }[];
  /** Coordinates actually used for each sliced dimension (nearest grid point). */
  slices: Record<string, number>;
  timestamp: number | null;
}

/** A server-shaded image; the client draws axes and the colorbar. */
export interface IImageRender {
  /** Base64 PNG, row 0 at the bottom. */
  image: string;
  imageSize: { width: number; height: number };
  /** Outer cell/bin edges in data units. */
  extent: { xMin: number; xMax: number; yMin: number; yMax: number };
  colorbar: {
    vmin: number;
    vmax: number;
    scale: ColorScale;
    colors: string[];
  };
  timestamp: number;
}

export interface IPseudocolorRender extends IImageRender {
  /** Coordinates actually used for dims beyond x/y (nearest grid point). */
  slices: Record<string, number>;
}

export interface IParticlePhase extends IImageRender {
  /** Weight of selected particles outside a log axis (values <= 0). */
  excludedWeight: number;
}

export interface IParticleHistogram {
  /** Bin edges in data units (bins + 1 values). */
  edges: number[];
  series: { species: number[]; counts: number[]; excludedWeight: number }[];
  timestamp: number;
}
