import { useCallback, useEffect, useState } from "react";
import { ISimulation } from "../global";
import {
  addSimulation,
  fetchSimulations,
  unloadSimulation,
} from "../services/simulationService";

export const useSimulations = () => {
  const [simulations, setSimulations] = useState<ISimulation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSimulations = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await fetchSimulations();
      setSimulations(fetched);
    } catch (error) {
      console.error("Failed to fetch simulations", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSimulations();
  }, [refreshSimulations]);

  const handleAddSimulation = useCallback(
    async (path: string) => {
      setIsLoading(true);
      try {
        const next = await addSimulation(path);
        setSimulations(next);
      } catch (error) {
        console.error("Failed to add simulation", error);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const handleUnloadSimulation = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const next = await unloadSimulation(id);
      setSimulations(next);
    } catch (error) {
      console.error("Failed to unload simulation", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    simulations,
    isLoading,
    addSimulation: handleAddSimulation,
    unloadSimulation: handleUnloadSimulation,
    refreshSimulations,
  };
};
