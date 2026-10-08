import {
  IParticleHistogramConfig,
  IParticlePhaseConfig,
  IRegion,
} from "../state/schema";
import { Variables } from "./fields";
import { requestJson, simulationUrl } from "./http";
import { IParticleHistogram, IParticleMetadata, IParticlePhase } from "./types";

export const fetchParticleMetadata = (simulationId: string) =>
  requestJson<IParticleMetadata>(simulationUrl(simulationId, "particles"));

export const checkParticleQuantity = (
  simulationId: string,
  expression: string,
  variables: Variables = {},
) =>
  requestJson<{ expression: string }>(
    simulationUrl(simulationId, "particles/check"),
    { body: { expression, variables } },
  );

/**
 * Only `x` and `series` affect the binning; display settings stay
 * client-side. `regions` defines every region the lines refer to.
 */
export const renderParticleHistogram = (
  simulationId: string,
  request: {
    config: Pick<IParticleHistogramConfig, "x" | "series">;
    regions: IRegion[];
    variables: Variables;
  },
  time: number,
  signal?: AbortSignal,
) =>
  requestJson<IParticleHistogram>(
    simulationUrl(simulationId, "render/particles/histogram"),
    { body: { ...request, time }, signal },
  );

/** `regions` defines every region the config refers to. */
export const renderParticlePhase = (
  simulationId: string,
  request: {
    config: IParticlePhaseConfig;
    regions: IRegion[];
    variables: Variables;
  },
  time: number,
  signal?: AbortSignal,
) =>
  requestJson<IParticlePhase>(
    simulationUrl(simulationId, "render/particles/phase"),
    { body: { ...request, time }, signal },
  );
