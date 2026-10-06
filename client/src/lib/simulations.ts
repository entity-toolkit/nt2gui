import { ISimulation } from "../state/schema";

/** How a simulation is shown: its name, else the last part of its path. */
export const simulationName = (simulation: ISimulation): string =>
  simulation.name ??
  simulation.path.split("/").filter(Boolean).pop() ??
  simulation.path;
