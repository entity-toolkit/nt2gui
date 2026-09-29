import { useCallback, useState } from "react";
import { IServerSnapshot } from "../global";
import {
  addSimulation,
  unloadSimulation,
} from "../services/simulationService";

type RunServerCommand = (
  command: () => Promise<IServerSnapshot>,
) => Promise<IServerSnapshot>;

/**
 * Simulation commands. The loaded simulations are part of the server
 * snapshot (see useUiState); this hook only tracks the in-flight request.
 */
export const useSimulations = (runServerCommand: RunServerCommand) => {
  const [isLoading, setIsLoading] = useState(false);

  const run = useCallback(
    async (command: () => Promise<IServerSnapshot>, action: string) => {
      setIsLoading(true);
      try {
        await runServerCommand(command);
      } catch (error) {
        console.error(`Failed to ${action}`, error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [runServerCommand],
  );

  const handleAddSimulation = useCallback(
    async (path: string) => {
      const trimmedPath = path.trim();
      if (!trimmedPath) {
        console.error("Simulation path is required");
        return;
      }
      await run(() => addSimulation(trimmedPath), "add simulation");
    },
    [run],
  );

  const handleUnloadSimulation = useCallback(
    (id: string) => run(() => unloadSimulation(id), "unload simulation"),
    [run],
  );

  return {
    isLoading,
    addSimulation: handleAddSimulation,
    unloadSimulation: handleUnloadSimulation,
  };
};
