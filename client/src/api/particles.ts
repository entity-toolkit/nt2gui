import {
  IParticleHistogramConfig,
  IParticlePhaseConfig,
} from "../state/schema";
import { requestJson, simulationUrl } from "./http";
import { IParticleHistogram, IParticleMetadata, IParticlePhase } from "./types";

export const fetchParticleMetadata = (simulationId: string) =>
  requestJson<IParticleMetadata>(simulationUrl(simulationId, "particles"));

export const checkParticleQuantity = (
  simulationId: string,
  expression: string,
) =>
  requestJson<{ expression: string }>(
    simulationUrl(simulationId, "particles/check"),
    {
      body: { expression },
    },
  );

/** Only `x` and `series` affect the binning; display settings stay client-side. */
export const renderParticleHistogram = (
  simulationId: string,
  config: Pick<IParticleHistogramConfig, "x" | "series">,
  time: number,
  signal?: AbortSignal,
) =>
  requestJson<IParticleHistogram>(
    simulationUrl(simulationId, "render/particles/histogram"),
    { body: { config, time }, signal },
  );

export const renderParticlePhase = (
  simulationId: string,
  config: IParticlePhaseConfig,
  time: number,
  signal?: AbortSignal,
) =>
  requestJson<IParticlePhase>(
    simulationUrl(simulationId, "render/particles/phase"),
    {
      body: { config, time },
      signal,
    },
  );
