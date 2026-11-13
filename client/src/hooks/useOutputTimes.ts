import { useEffect, useState } from "react";
import { fetchOutputTimes } from "../api/simulations";
import { mergeOutputTimes } from "../lib/playback";
import {
  useSimulationVersion,
  useSimulationVersions,
} from "../state/simulationData";
import { PRIMED_TIME, TIME, timeAxisFor } from "../state/transforms";
import { useUi } from "../state/UiContext";
import { cachedLoader, useCachedResource } from "./useCachedResource";

// Keyed by the id + NUL + the transform of t (only that moves the times), so
// a reload drops them (see state/simulationData.ts).
const getTimes = cachedLoader((key) => {
  const [id, timeTransform] = key.split("\0");
  const request = timeTransform
    ? fetchOutputTimes(id, { [TIME]: timeTransform }, PRIMED_TIME)
    : fetchOutputTimes(id, {}, TIME);
  return request.then(({ times }) => times);
});

/** The cache key of a simulation's output times on the timeline's axis. */
const useTimesKey = () => {
  const { uiState } = useUi();
  const transforms = uiState.coordinateTransforms ?? {};
  const primed = timeAxisFor(transforms, uiState.timeAxis) === PRIMED_TIME;
  return (id: string) => `${id}\0${primed ? transforms[TIME] : ""}`;
};

/**
 * A simulation's output times on the timeline's axis, ascending (null while
 * loading, or when its time can't be transformed).
 */
export const useOutputTimes = (simulationId: string | null) => {
  const keyOf = useTimesKey();
  return useCachedResource(
    simulationId === null ? null : keyOf(simulationId),
    getTimes,
    useSimulationVersion(simulationId),
  ).data;
};

/**
 * Every loaded simulation's output times as one list, for the global
 * timeline to step through (null until they load; simulations whose times
 * fail to load are left out).
 */
export const useTimelineOutputs = (): number[] | null => {
  const { simulations } = useUi();
  const keyOf = useTimesKey();
  const ids = simulations.map((simulation) => simulation.id);
  const keys = ids.map(keyOf).join("\n");
  const versions = useSimulationVersions(ids);
  const [state, setState] = useState<{ keys: string; times: number[] } | null>(
    null,
  );

  // Again after a reload (`versions`), keeping the old times meanwhile.
  useEffect(() => {
    if (!keys) return;
    let cancelled = false;
    Promise.allSettled(keys.split("\n").map((key) => getTimes(key))).then(
      (results) => {
        if (cancelled) return;
        const lists = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        setState({ keys, times: mergeOutputTimes(lists) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [keys, versions]);

  // Never the times of other simulations.
  return state && state.keys === keys ? state.times : null;
};
