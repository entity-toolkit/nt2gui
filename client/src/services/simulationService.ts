import { SERVER_URL } from "../config";
import { IServerSnapshot, ISimulationSummary } from "../global";
import { requestJson } from "./http";

export const addSimulation = (path: string): Promise<IServerSnapshot> =>
  requestJson<IServerSnapshot>(`${SERVER_URL}/simulations`, {
    method: "POST",
    body: { path },
  });

export const unloadSimulation = (id: string): Promise<IServerSnapshot> =>
  requestJson<IServerSnapshot>(
    `${SERVER_URL}/simulations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

export const fetchSimulationSummary = (id: string): Promise<ISimulationSummary> =>
  requestJson<ISimulationSummary>(
    `${SERVER_URL}/simulations/${encodeURIComponent(id)}/summary`,
  );
