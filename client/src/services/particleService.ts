import { SERVER_URL } from "../config";
import {
  IParticleHistogramConfig,
  IParticleMetadata,
  IParticlePhaseConfig,
} from "../global";
import { requestJson } from "./http";

export interface IParticleHistogram {
  /** Bin edges in data units (bins + 1 values). */
  edges: number[];
  series: { species: number[]; counts: number[]; excludedWeight: number }[];
  timestamp: number;
}

export interface IParticlePhase {
  image: string;
  imageSize: { width: number; height: number };
  /** Outer bin edges in data units. */
  extent: { xMin: number; xMax: number; yMin: number; yMax: number };
  colorbar: {
    vmin: number;
    vmax: number;
    scale: "linear" | "log";
    colors: string[];
  };
  /** Weight of selected particles outside a log axis (values <= 0). */
  excludedWeight: number;
  timestamp: number;
}

const simulationUrl = (simulationId: string) =>
  `${SERVER_URL}/simulations/${encodeURIComponent(simulationId)}`;

export const fetchParticleMetadata = (simulationId: string) =>
  requestJson<IParticleMetadata>(`${simulationUrl(simulationId)}/particles`);

export const checkParticleExpression = (
  simulationId: string,
  expression: string,
) =>
  requestJson<{ expression: string }>(
    `${simulationUrl(simulationId)}/particles/check`,
    { method: "POST", body: { expression } },
  );

export const renderParticleHistogram = (
  simulationId: string,
  config: IParticleHistogramConfig,
  time: number,
) =>
  requestJson<IParticleHistogram>(
    `${simulationUrl(simulationId)}/render/particles/histogram`,
    { method: "POST", body: { config, time } },
  );

export const renderParticlePhase = (
  simulationId: string,
  config: IParticlePhaseConfig,
  time: number,
) =>
  requestJson<IParticlePhase>(
    `${simulationUrl(simulationId)}/render/particles/phase`,
    { method: "POST", body: { config, time } },
  );
