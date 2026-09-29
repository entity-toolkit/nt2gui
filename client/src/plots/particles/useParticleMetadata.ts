import {
  checkParticleQuantity,
  fetchParticleMetadata,
} from "../../api/particles";
import { serverErrorMessage } from "../../api/http";
import { cachedLoader, useCachedResource } from "../../hooks/useCachedResource";

const getParticleMetadata = cachedLoader(fetchParticleMetadata);

/** A simulation's species and built-in particle quantities. */
export const useParticleMetadata = (simulationId: string | null) => {
  const { data, error } = useCachedResource(simulationId, getParticleMetadata);
  return { metadata: data, error };
};

/** Validates a particle expression; resolves to an error message or null. */
export const checkParticleExpression = (
  simulationId: string,
  expression: string,
) =>
  checkParticleQuantity(simulationId, expression).then(
    () => null,
    (error: unknown) => serverErrorMessage(error),
  );
