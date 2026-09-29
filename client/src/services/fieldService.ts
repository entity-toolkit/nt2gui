import { SERVER_URL } from "../config";
import { IFieldMetadata, ILineConfig, IRange } from "../global";
import { requestJson } from "./http";

export interface ILineRender {
  axis: string;
  coordinates: (number | null)[];
  series: { name: string; values: (number | null)[] }[];
  /** Coordinates actually used for each sliced dimension (nearest grid point). */
  slices: Record<string, number>;
  timestamp: number | null;
}

const simulationUrl = (simulationId: string) =>
  `${SERVER_URL}/simulations/${encodeURIComponent(simulationId)}`;

export const fetchFieldMetadata = (simulationId: string) =>
  requestJson<IFieldMetadata>(`${simulationUrl(simulationId)}/fields`);

export const renderLine = (
  simulationId: string,
  config: ILineConfig,
  time: number,
  range: IRange | null,
) =>
  requestJson<ILineRender>(`${simulationUrl(simulationId)}/render/line`, {
    method: "POST",
    body: { config, time, range },
  });
