import { SERVER_URL } from "../config";
import { IPseudocolorConfig } from "../global";

type PseudocolorResponse = {
  image: string;
  timestamp: number;
};

export const renderPseudocolor = async (
  simulationId: string,
  config: IPseudocolorConfig,
  time: number,
): Promise<PseudocolorResponse> => {
  const response = await fetch(
    `${SERVER_URL}/simulations/${simulationId}/render/pseudocolor`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, time }),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to render pseudocolor plot");
  }

  return response.json();
};
