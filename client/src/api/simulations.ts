import { apiUrl, requestJson, simulationUrl } from "./http";
import { IServerSnapshot, ISimulationSummary } from "./types";

export const addSimulation = (path: string) =>
  requestJson<IServerSnapshot>(apiUrl("simulations"), { body: { path } });

export const unloadSimulation = (id: string) =>
  requestJson<IServerSnapshot>(simulationUrl(id), { method: "DELETE" });

export const fetchSimulationSummary = (id: string) =>
  requestJson<ISimulationSummary>(simulationUrl(id, "summary"));
