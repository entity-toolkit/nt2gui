import { apiUrl, requestJson, simulationUrl } from "./http";
import { AttributeValue, IServerSnapshot, ISimulationSummary } from "./types";

export const addSimulation = (path: string) =>
  requestJson<IServerSnapshot>(apiUrl("simulations"), { body: { path } });

export const renameSimulation = (id: string, name: string) =>
  requestJson<IServerSnapshot>(simulationUrl(id), {
    method: "PATCH",
    body: { name },
  });

export const unloadSimulation = (id: string) =>
  requestJson<IServerSnapshot>(simulationUrl(id), { method: "DELETE" });

export const fetchSimulationSummary = (id: string) =>
  requestJson<ISimulationSummary>(simulationUrl(id, "summary"));

/** Re-reads a simulation from disk (new outputs, …); same id and name. */
export const reloadSimulation = (id: string) =>
  requestJson<IServerSnapshot>(simulationUrl(id, "reload"), {
    method: "POST",
  });

export const fetchSimulationAttributes = (id: string) =>
  requestJson<{ attrs: Record<string, AttributeValue> }>(
    simulationUrl(id, "attrs"),
  );
