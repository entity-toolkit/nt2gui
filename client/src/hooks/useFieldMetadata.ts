import { useEffect, useState } from "react";
import { IFieldMetadata } from "../global";
import { fetchFieldMetadata } from "../services/fieldService";

// A simulation's fields don't change while it is loaded, and ids are unique
// per load, so metadata is fetched once per simulation and shared by panels.
const cache = new Map<string, Promise<IFieldMetadata>>();

const loadMetadata = (simulationId: string) => {
  let request = cache.get(simulationId);
  if (!request) {
    request = fetchFieldMetadata(simulationId);
    // Don't cache failures, so a later render can retry.
    request.catch(() => cache.delete(simulationId));
    cache.set(simulationId, request);
  }
  return request;
};

export const useFieldMetadata = (simulationId: string | null) => {
  const [state, setState] = useState<{
    id: string | null;
    metadata: IFieldMetadata | null;
    error: string | null;
  }>({ id: null, metadata: null, error: null });

  useEffect(() => {
    if (!simulationId) return;
    let cancelled = false;
    loadMetadata(simulationId)
      .then((metadata) => {
        if (!cancelled) setState({ id: simulationId, metadata, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ id: simulationId, metadata: null, error: error.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [simulationId]);

  // Never hand out metadata that belongs to a previously selected simulation.
  return state.id === simulationId
    ? { metadata: state.metadata, error: state.error }
    : { metadata: null, error: null };
};
