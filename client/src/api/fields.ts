import {
  ILineConfig,
  IPseudocolorConfig,
  IRange,
  IZoomWindow,
  TimeAxis,
} from "../state/schema";
import { requestJson, simulationUrl } from "./http";
import { IFieldMetadata, ILineRender, IPseudocolorRender } from "./types";

/** Named variables a request uses (see state/variables.ts:usedVariables). */
export type Variables = Record<string, string>;

/**
 * What every render sends besides its config: the named variables it uses
 * and the session's coordinate transforms.
 */
export interface RenderContext {
  variables: Variables;
  transforms: Record<string, string>;
  /** The timeline's time ("t" or "tp"); request and response times are in it. */
  timeAxis: TimeAxis;
}

/**
 * Field names, dims and coordinates; with a `frame`, coordinates are in the
 * transformed units (at `frame.time` for a moving frame).
 */
export const fetchFieldMetadata = (
  simulationId: string,
  frame?: {
    transforms: Record<string, string>;
    time?: number;
    timeAxis?: TimeAxis;
  } | null,
) => {
  const query = new URLSearchParams();
  if (frame) {
    query.set("transforms", JSON.stringify(frame.transforms));
    if (frame.time !== undefined) query.set("time", String(frame.time));
    if (frame.timeAxis) query.set("timeAxis", frame.timeAxis);
  }
  const suffix = query.size ? `?${query}` : "";
  return requestJson<IFieldMetadata>(
    `${simulationUrl(simulationId, "fields")}${suffix}`,
  );
};

/**
 * Validates a field name or expression (which may use `variables`) and
 * returns its spatial dims.
 */
export const checkQuantity = (
  simulationId: string,
  expression: string,
  variables: Variables = {},
  transforms: Record<string, string> = {},
) =>
  requestJson<{ expression: string; dims: string[] }>(
    simulationUrl(simulationId, "quantities/check"),
    { body: { expression, variables, transforms } },
  );

export const renderLine = (
  simulationId: string,
  config: ILineConfig,
  time: number,
  range: IRange | null,
  context: RenderContext,
  signal?: AbortSignal,
) =>
  requestJson<ILineRender>(simulationUrl(simulationId, "render/line"), {
    body: { config, time, range, ...context },
    signal,
  });

export const renderPseudocolor = (
  simulationId: string,
  config: IPseudocolorConfig,
  time: number,
  viewport: IZoomWindow | null,
  context: RenderContext,
  signal?: AbortSignal,
) =>
  requestJson<IPseudocolorRender>(
    simulationUrl(simulationId, "render/pseudocolor"),
    {
      body: { config, time, viewport, ...context },
      signal,
    },
  );
