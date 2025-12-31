import { SERVER_URL } from "../config";
import { ISimulation, ITimeline } from "../global";

export type SimulationResponse = {
  simulations: ISimulation[];
  timeline?: ITimeline;
};

const checkResponse = async (response: Response) => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Request failed: ${response.status} ${message}`);
  }
};

export const fetchSimulations = async (): Promise<SimulationResponse> => {
  const response = await fetch(`${SERVER_URL}/simulations`);
  await checkResponse(response);
  const data: SimulationResponse = await response.json();
  return { simulations: data.simulations ?? [], timeline: data.timeline };
};

export const addSimulation = async (
  path: string,
): Promise<SimulationResponse> => {
  const response = await fetch(`${SERVER_URL}/simulations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  await checkResponse(response);
  const data: SimulationResponse = await response.json();
  return { simulations: data.simulations ?? [], timeline: data.timeline };
};

export const unloadSimulation = async (
  id: string,
): Promise<SimulationResponse> => {
  const response = await fetch(`${SERVER_URL}/simulations/${id}`, {
    method: "DELETE",
  });
  await checkResponse(response);
  const data: SimulationResponse = await response.json();
  return { simulations: data.simulations ?? [], timeline: data.timeline };
};
