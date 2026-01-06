import { useCallback, useEffect, useMemo, useState } from "react";
import { Model } from "flexlayout-react";
import {
  DataType,
  IPlotters,
  IUiState,
  ITimeline,
  IPseudocolorConfig,
  IZoomWindow,
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

const viewportsEqual = (a: IZoomWindow | null, b: IZoomWindow | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.xMin === b.xMin &&
    a.xMax === b.xMax &&
    a.yMin === b.yMin &&
    a.yMax === b.yMax
  );
};

export const useUiState = () => {
  const [model, setModel] = useState<Model>(
    Model.fromJson(initialUiState.layout),
  );
  const [plotters, setPlotters] = useState<IPlotters>(initialUiState.plotters);
  const [timeline, setTimeline] = useState<ITimeline>(initialUiState.timeline);
  const [globalViewport, setGlobalViewport] = useState<IZoomWindow | null>(
    initialUiState.globalViewport,
  );

  const persistState = useCallback(
    (
      layoutJson: IUiState["layout"],
      plotterState: IPlotters,
      timelineState: ITimeline,
      viewportState: IZoomWindow | null,
    ) => {
      persistUiState({
        layout: layoutJson,
        plotters: plotterState,
        timeline: timelineState,
        globalViewport: viewportState,
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

        persistState(model.toJson(), next, timeline, globalViewport);
        return next;
      });
    },
    [globalViewport, model, persistState, timeline],
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
            useGlobalViewport: existing?.useGlobalViewport ?? true,
            localViewport: existing?.localViewport ?? null,
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
            useGlobalViewport: existing?.useGlobalViewport ?? true,
            localViewport: existing?.localViewport ?? null,
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
        persistState(jsonModel, reconciledPlotters, timeline, globalViewport);
        return reconciledPlotters;
      });

      setModel(updatedModel);
    },
    [globalViewport, persistState, timeline],
  );

  useEffect(() => {
    const bootstrapModel = async () => {
      try {
        const restoredState = await fetchExistingUiState();
        if (restoredState?.layout) {
          setModel(Model.fromJson(restoredState.layout));
          setPlotters(restoredState.plotters ?? {});
          setTimeline(restoredState.timeline ?? initialUiState.timeline);
          setGlobalViewport(restoredState.globalViewport ?? null);
          return;
        }

        const serverState = await initializeUiState(initialUiState);
        setModel(Model.fromJson(serverState.layout));
        setPlotters(serverState.plotters ?? {});
        setTimeline(serverState.timeline ?? initialUiState.timeline);
        setGlobalViewport(serverState.globalViewport ?? null);
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
        persistState(model.toJson(), plotters, nextTimeline, globalViewport);
        return nextTimeline;
      });
    },
    [globalViewport, model, persistState, plotters],
  );

  const onGlobalViewportChange = useCallback(
    (viewport: IZoomWindow | null) => {
      setGlobalViewport((prev) => {
        if (viewportsEqual(prev, viewport)) {
          return prev;
        }

        const nextViewport = viewport ?? null;
        persistState(model.toJson(), plotters, timeline, nextViewport);
        return nextViewport;
      });
    },
    [model, persistState, plotters, timeline],
  );

  const onLocalViewportChange = useCallback(
    (nodeId: string, viewport: IZoomWindow | null) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing) {
          return prev;
        }

        if (viewportsEqual(existing.localViewport ?? null, viewport)) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            localViewport: viewport ?? null,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  const onSyncViewportToggle = useCallback(
    (nodeId: string, useGlobal: boolean) => {
      applyPlotterChange((prev) => {
        const existing = prev[nodeId];
        if (!existing || existing.useGlobalViewport === useGlobal) {
          return prev;
        }

        return {
          ...prev,
          [nodeId]: {
            ...existing,
            useGlobalViewport: useGlobal,
          },
        };
      });
    },
    [applyPlotterChange],
  );

  return useMemo(
    () => ({
      model,
      plotters,
      timeline,
      globalViewport,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
      onGlobalViewportChange,
      onLocalViewportChange,
      onSyncViewportToggle,
      handleModelChange,
    }),
    [
      handleModelChange,
      globalViewport,
      model,
      plotters,
      timeline,
      onDataTypeChange,
      onPlotTypeChange,
      onPseudocolorConfigChange,
      onPlotSimulationChange,
      onTimelineChange,
      onGlobalViewportChange,
      onLocalViewportChange,
      onSyncViewportToggle,
    ],
  );
};
