import {
  checkParticleQuantity,
  fetchParticleMetadata,
} from "../../api/particles";
import { serverErrorMessage } from "../../api/http";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";
import { useSimulationVersion } from "../../state/simulationData";

const getParticleMetadata = cachedLoader(fetchParticleMetadata);

/** A simulation's species and built-in particle quantities. */
export const useParticleMetadata = (simulationId: string | null) => {
  const { data, error } = useCachedResource(
    simulationId,
    getParticleMetadata,
    useSimulationVersion(simulationId),
  );
  return { metadata: data, error };
};

/**
 * Validates a particle expression (which may use the named `variables`);
 * resolves to an error message or null.
 */
export const checkParticleExpression = (
  simulationId: string,
  expression: string,
  variables: Record<string, string> = {},
  transforms: Record<string, string> = {},
) =>
  checkParticleQuantity(simulationId, expression, variables, transforms).then(
    () => null,
    (error: unknown) => serverErrorMessage(error),
  );
