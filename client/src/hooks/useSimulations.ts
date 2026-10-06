import { useState } from "react";
import {
  addSimulation,
  reloadSimulation,
  renameSimulation,
  unloadSimulation,
} from "../api/simulations";
import { IServerSnapshot } from "../api/types";
import { markSimulationReloaded } from "../state/simulationData";
import { useUiActions } from "../state/UiContext";

/**
 * Loading and unloading simulations. The loaded simulations come back in the
 * server snapshot; this hook only tracks the request in flight. Errors are
 * thrown to the caller, which shows them.
 */
export const useSimulations = () => {
  const { runServerCommand } = useUiActions();
  const [isLoading, setIsLoading] = useState(false);

  const run = async (command: () => Promise<IServerSnapshot>) => {
    setIsLoading(true);
    try {
      await runServerCommand(command);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    addSimulation: (path: string) => run(() => addSimulation(path)),
    unloadSimulation: (id: string) => run(() => unloadSimulation(id)),
    renameSimulation: (id: string, name: string) =>
      run(() => renameSimulation(id, name)),
    /** Re-reads a simulation from disk; its cached data and plots refresh. */
    reloadSimulation: async (id: string) => {
      await runServerCommand(() => reloadSimulation(id));
      markSimulationReloaded(id);
    },
  };
};
