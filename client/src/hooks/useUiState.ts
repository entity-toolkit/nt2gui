import { useCallback, useEffect, useMemo, useState } from "react";
import { Model } from "flexlayout-react";
import { DataType, IPlotters, IUiState, PlotType } from "../global";
import { initialUiState } from "../layoutDefaults";
import { collectPanelIds, reconcilePlotters } from "../plotterSync";
import {
  fetchExistingUiState,
  initializeUiState,
  persistUiState,
} from "../services/uiStateService";

export const useUiState = () => {
  const [model, setModel] = useState<Model>(Model.fromJson(initialUiState.layout));
  const [plotters, setPlotters] = useState<IPlotters>(initialUiState.plotters);

  const persistState = useCallback(
    (layoutJson: IUiState["layout"], plotterState: IPlotters) => {
      persistUiState({ layout: layoutJson, plotters: plotterState });
    },
    [],
  );

  const applyPlotterChange = useCallback(
    (updater: (prev: IPlotters) => IPlotters) => {
      setPlotters((prev) => {
        const next = updater(prev);
        if (next === prev) {
          return prev;
        }

        persistState(model.toJson(), next);
        return next;
      });
    },
    [model, persistState],
  );

  const onPlotTypeChange = useCallback(
    (nodeId: string, newPlotType: PlotType) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (existing?.plotType === newPlotType) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            plotType: newPlotType,
            dataType: existing?.dataType ?? DataType.None,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onDataTypeChange = useCallback(
    (nodeId: string, newDataType: DataType) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (existing?.dataType === newDataType) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            plotType: existing?.plotType ?? PlotType.None,
            dataType: newDataType,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const handleModelChange = useCallback(
    (updatedModel: Model) => {
      const jsonModel = updatedModel.toJson();
      setModel(Model.fromJson(jsonModel));
      persistState(jsonModel, plotters);
    },
    [persistState, plotters],
  );

  useEffect(() => {
    const bootstrapModel = async () => {
      try {
        const restoredState = await fetchExistingUiState();
        if (restoredState?.layout) {
          setModel(Model.fromJson(restoredState.layout));
          setPlotters(restoredState.plotters ?? {});
          return;
        }

        const serverState = await initializeUiState(initialUiState);
        setModel(Model.fromJson(serverState.layout));
        setPlotters(serverState.plotters ?? {});
      } catch (error) {
        console.error("Error initializing model:", error);
      }
    };

    bootstrapModel();
  }, []);

  useEffect(() => {
    const modelJson = model.toJson();
    const panelIds = collectPanelIds(modelJson);

    setPlotters((prevPlotters) => {
      const reconciledPlotters = reconcilePlotters(prevPlotters, panelIds);
      if (reconciledPlotters === prevPlotters) {
        return prevPlotters;
      }

      persistState(modelJson, reconciledPlotters);
      return reconciledPlotters;
    });
  }, [model, persistState]);

  return useMemo(
    () => ({
      model,
      plotters,
      onDataTypeChange,
      onPlotTypeChange,
      handleModelChange,
    }),
    [handleModelChange, model, plotters, onDataTypeChange, onPlotTypeChange],
  );
};
