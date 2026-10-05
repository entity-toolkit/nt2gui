import { Model } from "flexlayout-react";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { IServerSnapshot } from "../api/types";
import {
  assignSimulations,
  collectPanelIds,
  reconcilePlotters,
  setPlotType,
  updatePlotter,
} from "./plotters";
import { DataType, IPlotter, ISimulation, IUiState, PlotType } from "./schema";
import { SyncStatus } from "./StateSync";
import { useServerSession } from "./useServerSession";

export interface UiActions {
  /** Any update of the whole state (used for cross-plot settings like synced zoom). */
  updateUiState: (update: (prev: IUiState) => IUiState) => void;
  updatePlotter: (
    id: string,
    patch: Partial<IPlotter> | ((plotter: IPlotter) => Partial<IPlotter>),
  ) => void;
  setDataType: (id: string, dataType: DataType) => void;
  /** `defaults` are the plot kind's initial settings (see plots/registry.ts). */
  setPlotType: (
    id: string,
    plotType: PlotType,
    defaults?: Partial<IPlotter>,
  ) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  handleModelChange: (model: Model) => void;
  runServerCommand: <T extends IServerSnapshot>(
    command: () => Promise<T>,
  ) => Promise<T>;
  flushState: () => Promise<void>;
}

interface UiValue {
  uiState: IUiState;
  model: Model;
  simulations: ISimulation[];
  syncStatus: SyncStatus;
}

// State and actions are separate contexts: actions never change, so components
// that only act don't re-render with every state change.
const UiStateContext = createContext<UiValue | null>(null);
const UiActionsContext = createContext<UiActions | null>(null);

/**
 * Loads the session from the server and provides it to the app. Renders
 * `fallback(loadError)` until the first snapshot arrives.
 */
export const UiProvider = ({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (loadError: string | null) => ReactNode;
}) => {
  const session = useServerSession();
  const { updateUiState, setLayout, runServerCommand, flushState } = session;

  const actions = useMemo<UiActions>(
    () => ({
      updateUiState,
      updatePlotter: (id, patch) =>
        updateUiState((prev) => {
          const plotters = updatePlotter(prev.plotters, id, patch);
          return plotters === prev.plotters ? prev : { ...prev, plotters };
        }),
      setDataType: (id, dataType) =>
        updateUiState((prev) => {
          const plotters = updatePlotter(prev.plotters, id, { dataType });
          return plotters === prev.plotters ? prev : { ...prev, plotters };
        }),
      setPlotType: (id, plotType, defaults) =>
        updateUiState((prev) => {
          const plotters = setPlotType(prev.plotters, id, plotType, defaults);
          return plotters === prev.plotters ? prev : { ...prev, plotters };
        }),
      setSidebarCollapsed: (sidebarCollapsed) =>
        updateUiState((prev) =>
          (prev.sidebarCollapsed ?? false) === sidebarCollapsed
            ? prev
            : { ...prev, sidebarCollapsed },
        ),
      handleModelChange: (model) => {
        const layout = model.toJson();
        const panelIds = collectPanelIds(layout);
        setLayout(layout, (prev) => ({
          ...prev,
          layout,
          plotters: reconcilePlotters(prev.plotters, panelIds),
        }));
      },
      runServerCommand,
      flushState,
    }),
    [flushState, runServerCommand, setLayout, updateUiState],
  );

  // Plots showing data always point at a loaded simulation.
  const simulationIds = session.simulations
    .map((simulation) => simulation.id)
    .join("\n");
  const plotters = session.uiState?.plotters;
  useEffect(() => {
    if (!plotters) return;
    const ids = simulationIds ? simulationIds.split("\n") : [];
    updateUiState((prev) => {
      const next = assignSimulations(prev.plotters, ids);
      return next === prev.plotters ? prev : { ...prev, plotters: next };
    });
  }, [plotters, simulationIds, updateUiState]);

  const { uiState, model, simulations, syncStatus } = session;
  const value = useMemo(
    () =>
      uiState && model ? { uiState, model, simulations, syncStatus } : null,
    [model, simulations, syncStatus, uiState],
  );

  if (!value) return <>{fallback(session.loadError)}</>;
  return (
    <UiActionsContext.Provider value={actions}>
      <UiStateContext.Provider value={value}>
        {children}
      </UiStateContext.Provider>
    </UiActionsContext.Provider>
  );
};

export const useUi = (): UiValue => {
  const value = useContext(UiStateContext);
  if (!value) throw new Error("useUi must be used inside <UiProvider>");
  return value;
};

export const useUiActions = (): UiActions => {
  const actions = useContext(UiActionsContext);
  if (!actions)
    throw new Error("useUiActions must be used inside <UiProvider>");
  return actions;
};
