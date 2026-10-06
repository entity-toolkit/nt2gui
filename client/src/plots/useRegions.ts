import {
  ChartSelection,
  selectionToRegion,
  withoutRegion,
  withRegion,
} from "../state/regions";
import { useUi, useUiActions } from "../state/UiContext";

/** The saved regions, and saving or removing one. */
export const useRegions = () => {
  const { uiState } = useUi();
  const { updateUiState } = useUiActions();
  return {
    regions: uiState.regions ?? [],
    /** Saves the spatial part of a selection made on axes `x` (and `y`). */
    save: (
      selection: ChartSelection,
      axes: { x: string | null; y?: string | null },
    ) => {
      const region = selectionToRegion(selection, axes);
      if (region) updateUiState((state) => withRegion(state, region));
    },
    remove: (name: string) =>
      updateUiState((state) => withoutRegion(state, name)),
  };
};
