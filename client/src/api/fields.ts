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

/** Named variables a request uses (see state/variables.ts:usedVariables). */
export type Variables = Record<string, string>;

/**
 * Validates a field name or expression (which may use `variables`) and
 * returns its spatial dims.
 */
export const checkQuantity = (
  simulationId: string,
  expression: string,
  variables: Variables = {},
) =>
  requestJson<{ expression: string; dims: string[] }>(
    simulationUrl(simulationId, "quantities/check"),
    { body: { expression, variables } },
  );

export const renderLine = (
  simulationId: string,
  config: ILineConfig,
  time: number,
  range: IRange | null,
  variables: Variables,
  signal?: AbortSignal,
) =>
  requestJson<ILineRender>(simulationUrl(simulationId, "render/line"), {
    body: { config, time, range, variables },
    signal,
  });

export const renderPseudocolor = (
  simulationId: string,
  config: IPseudocolorConfig,
  time: number,
  viewport: IZoomWindow | null,
  variables: Variables,
  signal?: AbortSignal,
) =>
  requestJson<IPseudocolorRender>(
    simulationUrl(simulationId, "render/pseudocolor"),
    {
      body: { config, time, viewport, variables },
      signal,
    },
  );
