import { fetchTimeSpan } from "../api/simulations";
import { useSimulationVersion } from "../state/simulationData";
import { PRIMED_TIME, TIME, timeAxisFor } from "../state/transforms";
import { useUi } from "../state/UiContext";
import { cachedLoader, useCachedResource } from "./useCachedResource";

// Keyed by the id + NUL + the transform of t (only that moves the span), so
// a reload drops it (see state/simulationData.ts).
const getSpan = cachedLoader((key) => {
  const [id, timeTransform] = key.split("\0");
  return timeTransform
    ? fetchTimeSpan(id, { [TIME]: timeTransform }, PRIMED_TIME)
    : fetchTimeSpan(id, {}, TIME);
});

/**
 * A simulation's first and last output times on the timeline's axis (null
 * while loading, or when its time can't be transformed).
 */
export const useTimeSpan = (simulationId: string | null) => {
  const { uiState } = useUi();
  const transforms = uiState.coordinateTransforms ?? {};
  const primed = timeAxisFor(transforms, uiState.timeAxis) === PRIMED_TIME;
  const key =
    simulationId === null
      ? null
      : `${simulationId}\0${primed ? transforms[TIME] : ""}`;
  return useCachedResource(key, getSpan, useSimulationVersion(simulationId))
    .data;
};
