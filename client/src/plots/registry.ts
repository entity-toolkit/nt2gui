/**
 * Every plot kind the app offers. A panel's plot kind is looked up from its
 * (dataType, plotType); adding a kind means one entry here.
 */
import { DataType, PlotType } from "../state/schema";
import FieldLinePlot from "./fieldLine/FieldLinePlot";
import { defaultLineConfig } from "./fieldLine/config";
import FieldPseudocolorPlot from "./fieldPseudocolor/FieldPseudocolorPlot";
import { defaultPseudocolorConfig } from "./fieldPseudocolor/config";
import ParticleHistogramPlot from "./particleHistogram/ParticleHistogramPlot";
import ParticlePhasePlot from "./particlePhase/ParticlePhasePlot";
import {
  defaultParticleHistogramConfig,
  defaultParticlePhaseConfig,
} from "./particles/config";
import { PlotKind } from "./types";

export const PLOT_KINDS: PlotKind[] = [
  {
    id: "field-line",
    dataType: DataType.Fields,
    plotType: PlotType.Line,
    label: "1D plot",
    defaults: { lineConfig: defaultLineConfig, lineViewport: null },
    Plot: FieldLinePlot,
  },
  {
    id: "field-pseudocolor",
    dataType: DataType.Fields,
    plotType: PlotType.Pseudocolor,
    label: "2D pseudocolor",
    defaults: { pseudocolorConfig: defaultPseudocolorConfig },
    Plot: FieldPseudocolorPlot,
  },
  {
    id: "particle-histogram",
    dataType: DataType.Particles,
    plotType: PlotType.Line,
    label: "1D histogram",
    defaults: { particleHistogramConfig: defaultParticleHistogramConfig },
    Plot: ParticleHistogramPlot,
  },
  {
    id: "particle-phase",
    dataType: DataType.Particles,
    plotType: PlotType.Pseudocolor,
    label: "2D histogram (phase space)",
    defaults: { particlePhaseConfig: defaultParticlePhaseConfig },
    Plot: ParticlePhasePlot,
  },
];

export const findPlotKind = (dataType: DataType, plotType: PlotType) =>
  PLOT_KINDS.find(
    (kind) => kind.dataType === dataType && kind.plotType === plotType,
  );
