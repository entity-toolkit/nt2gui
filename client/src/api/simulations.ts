import { apiUrl, requestJson, simulationUrl } from "./http";
import { ITimeline, TimeAxis } from "../state/schema";
import {
  AttributeValue,
  IServerSnapshot,
  ISimulationSummary,
  ITransformCheck,
} from "./types";

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

/** Whether `transforms` work for this simulation, and the ranges they give. */
export const checkTransforms = (
  id: string,
  transforms: Record<string, string>,
) =>
  requestJson<ITransformCheck>(simulationUrl(id, "transforms/check"), {
    body: { transforms },
  });

/**
 * This simulation's timeline under `transforms` on `timeAxis`, at the output
 * nearest to `previous.time` under the previous transforms and axis.
 */
export const fetchTimeline = (
  id: string,
  transforms: Record<string, string>,
  timeAxis: TimeAxis,
  previous: {
    transforms: Record<string, string>;
    timeAxis: TimeAxis;
    time: number;
  },
) =>
  requestJson<ITimeline>(simulationUrl(id, "timeline"), {
    body: { transforms, timeAxis, previous },
  });
