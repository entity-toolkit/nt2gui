import { useEffect, useState } from "react";
import { IParticleMetadata } from "../global";
import {
  checkParticleExpression,
  fetchParticleMetadata,
} from "../services/particleService";
import { serverErrorMessage } from "../services/sessionService";

// Species and quantities don't change while a simulation is loaded.
const metadataCache = new Map<string, Promise<IParticleMetadata>>();
const checkCache = new Map<string, Promise<string | null>>();

/** Validates a particle expression; resolves to an error message or null. */
export const checkParticleQuantity = (
  simulationId: string,
  expression: string,
): Promise<string | null> => {
  const key = `${simulationId}\u0000${expression}`;
  let request = checkCache.get(key);
  if (!request) {
    request = checkParticleExpression(simulationId, expression).then(
      () => null,
      (error: unknown) => {
        checkCache.delete(key);
        return serverErrorMessage(error);
      },
    );
    checkCache.set(key, request);
  }
  return request;
};

export const useParticleMetadata = (simulationId: string | null) => {
  const [state, setState] = useState<{
    id: string | null;
    metadata: IParticleMetadata | null;
    error: string | null;
  }>({ id: null, metadata: null, error: null });

  useEffect(() => {
    if (!simulationId) return;
    let cancelled = false;
    let request = metadataCache.get(simulationId);
    if (!request) {
      request = fetchParticleMetadata(simulationId);
      request.catch(() => metadataCache.delete(simulationId));
      metadataCache.set(simulationId, request);
    }
    request
      .then((metadata) => {
        if (!cancelled) setState({ id: simulationId, metadata, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            id: simulationId,
            metadata: null,
            error: serverErrorMessage(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [simulationId]);

  return state.id === simulationId
    ? { metadata: state.metadata, error: state.error }
    : { metadata: null, error: null };
};
