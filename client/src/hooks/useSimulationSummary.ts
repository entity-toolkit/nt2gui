import { useEffect, useState } from "react";
import { ISimulationSummary } from "../global";
import { serverErrorMessage } from "../services/sessionService";
import { fetchSimulationSummary } from "../services/simulationService";

// A loaded simulation's contents don't change, and ids are unique per load.
const cache = new Map<string, Promise<ISimulationSummary>>();

export const useSimulationSummary = (simulationId: string) => {
  const [state, setState] = useState<{
    summary: ISimulationSummary | null;
    error: string | null;
  }>({ summary: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let request = cache.get(simulationId);
    if (!request) {
      request = fetchSimulationSummary(simulationId);
      request.catch(() => cache.delete(simulationId));
      cache.set(simulationId, request);
    }
    request
      .then((summary) => !cancelled && setState({ summary, error: null }))
      .catch(
        (error: unknown) =>
          !cancelled &&
          setState({ summary: null, error: serverErrorMessage(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [simulationId]);

  return state;
};
