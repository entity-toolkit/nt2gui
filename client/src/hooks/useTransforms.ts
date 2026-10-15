import { fetchTimeline } from "../api/simulations";
import { TimeAxis } from "../state/schema";
import {
  Transforms,
  cleanTransforms,
  timeAxisFor,
  timelineMoves,
  withTransforms,
} from "../state/transforms";
import { useUi, useUiActions } from "../state/UiContext";

/**
 * Changing the session's coordinate transforms or the timeline's time axis.
 * When the timeline's values move (time's transform changed while it runs in
 * t′, or it switches between t and t′), the new timeline is fetched first so
 * it stays at the same output. It follows the last loaded simulation, as
 * when loading one.
 */
export const useTransforms = () => {
  const { uiState, simulations } = useUi();
  const { updateUiState } = useUiActions();
  const transforms = uiState.coordinateTransforms ?? {};
  const timeAxis = timeAxisFor(transforms, uiState.timeAxis);

  const change = async (next: Transforms, axis: TimeAxis) => {
    const clean = cleanTransforms(next);
    const nextAxis = timeAxisFor(clean, axis);
    const reference = simulations[simulations.length - 1];
    const timeline =
      reference && timelineMoves(transforms, timeAxis, clean, nextAxis)
        ? await fetchTimeline(reference.id, clean, nextAxis, {
            transforms,
            timeAxis,
            time: uiState.timeline.current,
          })
        : undefined;
    updateUiState((prev) => withTransforms(prev, clean, timeline, nextAxis));
  };

  return {
    transforms,
    timeAxis,
    /** Applies new transforms (already checked); the time axis stays if it can. */
    apply: (next: Transforms) => change(next, timeAxis),
    setTimeAxis: (axis: TimeAxis) => change(transforms, axis),
  };
};
