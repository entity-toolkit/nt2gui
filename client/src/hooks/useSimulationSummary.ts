import { useEffect, useState } from "react";
import { fetchSimulationSummary } from "../api/simulations";
import { ISimulationSummary } from "../api/types";
import { ISimulation } from "../state/schema";
import { useSimulationVersion } from "../state/simulationData";
import { cachedLoader, useCachedResource } from "./useCachedResource";

// Cached until the simulation is reloaded (see state/simulationData.ts).
export const getSummary = cachedLoader(fetchSimulationSummary);

/** One simulation's summary (sidebar card), refreshed when it's reloaded. */
export const useSimulationSummary = (id: string) =>
  useCachedResource(id, getSummary, useSimulationVersion(id));

/** The coordinates a summary shows: field grid axes and particle positions. */
const coordinatesIn = (summary: ISimulationSummary): string[] => [
  ...(summary.fields?.axes.map((axis) => axis.name) ?? []),
  ...(summary.particles?.quantities ?? []),
];

/**
 * Which of `candidates` any of the loaded simulations has (as a field axis
 * or a particle column); `always` are kept regardless (e.g. time). Until the
 * summaries load, all candidates.
 */
export const usePresentCoordinates = (
  simulations: ISimulation[],
  candidates: string[],
  always: string[] = [],
): string[] => {
  const ids = simulations.map((simulation) => simulation.id).join("\n");
  const [present, setPresent] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      (ids ? ids.split("\n") : []).map((id) => getSummary(id)),
    ).then((results) => {
      if (cancelled) return;
      const names = new Set<string>();
      for (const result of results) {
        if (result.status === "fulfilled") {
          coordinatesIn(result.value).forEach((name) => names.add(name));
        }
      }
      setPresent(names);
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return candidates.filter(
    (name) => !present || present.has(name) || always.includes(name),
  );
};
