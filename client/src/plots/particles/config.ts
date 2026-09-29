/** Settings helpers shared by the particle plot kinds. */
import {
  ILineRender,
  IParticleHistogram,
  IParticleMetadata,
} from "../../api/types";
import {
  IParticleAxis,
  IParticleHistogramConfig,
  IParticlePhaseConfig,
  IParticleSeries,
  ParticleScale,
} from "../../state/schema";

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

/** Species selections use [] for "all species". */
export const isSpeciesSelected = (selected: number[], index: number) =>
  selected.length === 0 || selected.includes(index);

/**
 * Toggles one species. Selecting everything collapses back to [] (all), so
 * species added to a simulation later are included too; deselecting the last
 * one also means all, as an empty plot is never useful.
 */
export const toggleSpecies = (
  selected: number[],
  index: number,
  allSpecies: number[],
): number[] => {
  const current = selected.length ? selected : allSpecies;
  const next = current.includes(index)
    ? current.filter((sp) => sp !== index)
    : [...current, index];
  const complete = allSpecies.every((sp) => next.includes(sp));
  return complete || next.length === 0
    ? []
    : allSpecies.filter((sp) => next.includes(sp));
};

export const speciesLabel = (
  selected: number[],
  metadata: IParticleMetadata | null,
): string => {
  if (!selected.length) return "all species";
  const label = (index: number) =>
    metadata?.species.find((sp) => sp.index === index)?.label ?? `sp ${index}`;
  return selected.map(label).join(" + ");
};

/** One histogram line per species. */
export const seriesPerSpecies = (
  metadata: IParticleMetadata,
): IParticleSeries[] =>
  metadata.species.map((species) => ({ species: [species.index] }));

/** The scale a quantity starts with: log for gamma/energy, linear otherwise. */
export const defaultScaleFor = (
  quantity: string,
  metadata: IParticleMetadata | null,
): ParticleScale =>
  metadata?.quantities.find((q) => q.name === quantity)?.defaultScale ??
  "linear";

/** Switching quantity resets the scale to its default and the range. */
export const withAxisQuantity = (
  axis: IParticleAxis,
  quantity: string,
  metadata: IParticleMetadata | null,
): IParticleAxis => {
  if (axis.quantity === quantity) return axis;
  const { min: _min, max: _max, ...rest } = axis;
  return { ...rest, quantity, scale: defaultScaleFor(quantity, metadata) };
};

/** The axis with its binned range back on automatic. */
export const withoutRange = (axis: IParticleAxis): IParticleAxis => {
  if (axis.min === undefined && axis.max === undefined) return axis;
  const { min: _min, max: _max, ...rest } = axis;
  return rest;
};

export const hasRange = (axis: IParticleAxis) =>
  axis.min !== undefined || axis.max !== undefined;

/** Zooms a phase plot into a box (data units): both axes re-bin that range. */
export const withZoomWindow = (
  config: IParticlePhaseConfig,
  window: { xMin: number; xMax: number; yMin: number; yMax: number },
): IParticlePhaseConfig => ({
  ...config,
  x: { ...config.x, min: window.xMin, max: window.xMax },
  y: { ...config.y, min: window.yMin, max: window.yMax },
});

/** Changing the scale drops a range that may be invalid for it (e.g. log of 0). */
export const withAxisScale = (
  axis: IParticleAxis,
  scale: ParticleScale,
): IParticleAxis => {
  if (axis.scale === scale) return axis;
  const { min: _min, max: _max, ...rest } = axis;
  return { ...rest, scale };
};

/** What the server needs to bin; display-only settings are left out so
 * changing them doesn't recompute the histogram. */
export const histogramRequest = ({ x, series }: IParticleHistogramConfig) => ({
  x,
  series,
});

export const phaseRequest = ({
  expressions: _expressions,
  ...rest
}: IParticlePhaseConfig) => rest;

/**
 * A histogram as line data for LineChart, drawn as steps: `coordinates` are
 * the bin edges and each series repeats its last count for the closing edge.
 */
export const histogramToLines = (
  histogram: IParticleHistogram,
  labels: string[],
  quantity: string,
): ILineRender => ({
  axis: quantity,
  coordinates: histogram.edges,
  series: histogram.series.map((line, index) => ({
    name: labels[index] ?? `line ${index + 1}`,
    values: [...line.counts, line.counts[line.counts.length - 1] ?? 0],
  })),
  slices: {},
  timestamp: histogram.timestamp,
});

/** Distinct labels for identical series ("e-", "e- (2)"), so legend keys stay unique. */
export const uniqueLabels = (labels: string[]) => {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });
};
