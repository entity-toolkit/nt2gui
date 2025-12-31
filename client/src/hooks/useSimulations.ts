import { useCallback, useEffect, useState } from "react";
import { ISimulation, ITimeline } from "../global";
import {
  addSimulation,
  fetchSimulations,
  unloadSimulation,
  SimulationResponse,
} from "../services/simulationService";

type UseSimulationsOptions = {
  onTimelineUpdate?: (timeline: ITimeline) => void;
};

export const useSimulations = (options?: UseSimulationsOptions) => {
  const [simulations, setSimulations] = useState<ISimulation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const applyResponse = useCallback(
    (response: SimulationResponse) => {
      setSimulations(response.simulations ?? []);
      if (response.timeline) {
        options?.onTimelineUpdate?.(response.timeline);
      }
    },
    [options?.onTimelineUpdate],
  );

  const refreshSimulations = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await fetchSimulations();
      applyResponse(fetched);
    } catch (error) {
      console.error("Failed to fetch simulations", error);
    } finally {
      setIsLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    refreshSimulations();
  }, [refreshSimulations]);

  const handleAddSimulation = useCallback(async (path: string) => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      console.error("Simulation path is required");
      return;
    }

    setIsLoading(true);
    try {
      const next = await addSimulation(trimmedPath);
      applyResponse(next);
    } catch (error) {
      console.error("Failed to add simulation", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [applyResponse]);

  const handleUnloadSimulation = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const next = await unloadSimulation(id);
      applyResponse(next);
    } catch (error) {
      console.error("Failed to unload simulation", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [applyResponse]);

  return {
    simulations,
    isLoading,
    addSimulation: handleAddSimulation,
    unloadSimulation: handleUnloadSimulation,
    refreshSimulations,
  };
};
