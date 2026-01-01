import { useCallback, useEffect, useMemo, useState } from "react";
import { Model } from "flexlayout-react";
import {
  DataType,
  IPlotters,
  IUiState,
  ITimeline,
  IPseudocolorConfig,
  PlotType,
  defaultPseudocolorConfig,
} from "../global";
import { initialUiState } from "../layoutDefaults";
import { collectPanelIds, reconcilePlotters } from "../plotterSync";
import {
  fetchExistingUiState,
  initializeUiState,
  persistUiState,
} from "../services/uiStateService";

export const useUiState = () => {
  const [model, setModel] = useState<Model>(
    Model.fromJson(initialUiState.layout),
  );
  const [plotters, setPlotters] = useState<IPlotters>(initialUiState.plotters);
  const [timeline, setTimeline] = useState<ITimeline>(initialUiState.timeline);

  const persistState = useCallback(
    (
      layoutJson: IUiState["layout"],
      plotterState: IPlotters,
      timelineState: ITimeline,
    ) => {
      persistUiState({
        layout: layoutJson,
        plotters: plotterState,
        timeline: timelineState,
      });
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

        persistState(model.toJson(), next, timeline);
        return next;
      });
    },
    [model, persistState, timeline],
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
            ...existing,
            plotType: newPlotType,
            dataType: existing?.dataType ?? DataType.None,
            pseudocolorConfig:
              newPlotType === PlotType.Pseudocolor
                ? (existing?.pseudocolorConfig ?? {
                    ...defaultPseudocolorConfig,
                  })
                : existing?.pseudocolorConfig,
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
            ...existing,
            plotType: existing?.plotType ?? PlotType.None,
            dataType: newDataType,
            pseudocolorConfig: existing?.pseudocolorConfig,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const handleModelChange = useCallback(
    (updatedModel: Model) => {
      const jsonModel = updatedModel.toJson();
      const panelIds = collectPanelIds(jsonModel);

      setPlotters((prevPlotters) => {
        const reconciledPlotters = reconcilePlotters(prevPlotters, panelIds);
        persistState(jsonModel, reconciledPlotters, timeline);
        return reconciledPlotters;
      });

      setModel(updatedModel);
    },
    [persistState, timeline],
  );

  useEffect(() => {
    const bootstrapModel = async () => {
      try {
        const restoredState = await fetchExistingUiState();
        if (restoredState?.layout) {
          setModel(Model.fromJson(restoredState.layout));
          setPlotters(restoredState.plotters ?? {});
          setTimeline(restoredState.timeline ?? initialUiState.timeline);
          return;
        }

        const serverState = await initializeUiState(initialUiState);
        setModel(Model.fromJson(serverState.layout));
        setPlotters(serverState.plotters ?? {});
        setTimeline(serverState.timeline ?? initialUiState.timeline);
      } catch (error) {
        console.error("Error initializing model:", error);
      }
    };

    bootstrapModel();
  }, []);

  const onPseudocolorConfigChange = useCallback(
    (nodeId: string, config: IPseudocolorConfig) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            pseudocolorConfig: config,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onPlotSimulationChange = useCallback(
    (nodeId: string, simulationId?: string) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing || existing.simulationId === simulationId) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            simulationId,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onTimelineChange = useCallback(
    (nextTimeline: ITimeline) => {
      setTimeline(() => {
        persistState(model.toJson(), plotters, nextTimeline);
        return nextTimeline;
      });
    },
    [model, persistState, plotters],
  );

  return useMemo(
    () => ({
      model,
      plotters,
      timeline,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
      handleModelChange,
    }),
    [
      handleModelChange,
      model,
      plotters,
      timeline,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
    ],
  );
};
