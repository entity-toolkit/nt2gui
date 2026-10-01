import {
  ILineConfig,
  IPseudocolorConfig,
  IRange,
  IZoomWindow,
} from "../state/schema";
import { requestJson, simulationUrl } from "./http";
import { IFieldMetadata, ILineRender, IPseudocolorRender } from "./types";

export const fetchFieldMetadata = (simulationId: string) =>
  requestJson<IFieldMetadata>(simulationUrl(simulationId, "fields"));

/** Validates a field name or expression and returns its spatial dims. */
export const checkQuantity = (simulationId: string, expression: string) =>
  requestJson<{ expression: string; dims: string[] }>(
    simulationUrl(simulationId, "quantities/check"),
    { body: { expression } },
  );

export const renderLine = (
  simulationId: string,
  config: ILineConfig,
  time: number,
  range: IRange | null,
  signal?: AbortSignal,
) =>
  requestJson<ILineRender>(simulationUrl(simulationId, "render/line"), {
    body: { config, time, range },
    signal,
  });

export const renderPseudocolor = (
  simulationId: string,
  config: IPseudocolorConfig,
  time: number,
  viewport: IZoomWindow | null,
  signal?: AbortSignal,
) =>
  requestJson<IPseudocolorRender>(
    simulationUrl(simulationId, "render/pseudocolor"),
    {
      body: { config, time, viewport },
      signal,
    },
  );
