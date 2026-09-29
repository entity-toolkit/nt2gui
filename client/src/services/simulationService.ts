import { SERVER_URL } from "../config";
import { IServerSnapshot } from "../global";
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
