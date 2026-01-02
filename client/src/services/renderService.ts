import { SERVER_URL } from "../config";
import { IPseudocolorConfig } from "../global";

export type TickSet = {
  positions: number[];
  labels: string[];
};

export type ColorbarTicks = {
  ticks: number[];
  labels: string[];
  vmin: number;
  vmax: number;
};

export type PseudocolorResponse = {
  image: string;
  timestamp: number;
  extent: { xMin: number; xMax: number; yMin: number; yMax: number };
  imageSize: { width: number; height: number };
  xTicks: TickSet;
  yTicks: TickSet;
  colorbar: ColorbarTicks;
  colorMap: string;
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
