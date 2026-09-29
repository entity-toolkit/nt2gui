import { useCallback, useState } from "react";

import {
  Layout,
  Model,
  TabNode,
  TabSetNode,
  BorderNode,
  ITabSetRenderValues,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";

import { ITooltipDatum, IUiState } from "./global";
import AddTabButton from "./components/AddTabButton";
import Panel from "./components/Panel";
import Menubar from "./components/Menubar";
import FooterBar from "./components/FooterBar";
import SimulationSidebar from "./components/SimulationSidebar";
import { useUiState } from "./hooks/useUiState";
import { useSimulations } from "./hooks/useSimulations";
import { useSessionFiles } from "./hooks/useSessionFiles";

const App = () => {
  const {
    model,
    uiState,
    simulations,
    syncStatus,
    loadError,
    runServerCommand,
    flushState,
    onDataTypeChange,
    onPlotTypeChange,
    onPseudocolorConfigChange,
    onPlotSimulationChange,
    onTimelineChange,
    onGlobalViewportChange,
    onLocalViewportChange,
    onSyncViewportToggle,
    onLineConfigChange,
    onLineRangeChange,
    onPlotterPatch,
    onSidebarCollapsedChange,
    handleModelChange,
  } = useUiState();
  const { isLoading, addSimulation, unloadSimulation } =
    useSimulations(runServerCommand);
  const sessionFiles = useSessionFiles(runServerCommand, flushState);

  const [globalTooltip, setGlobalTooltip] = useState<ITooltipDatum | null>(
    null,
  );
  const handleGlobalTooltipChange = useCallback(
    (tooltip: ITooltipDatum | null) => setGlobalTooltip(tooltip),
    [],
  );

  if (!model || !uiState) {
    return (
      <div className="app-loading" role="status">
        {loadError
          ? `Cannot reach the server (${loadError}). Retrying…`
          : "Loading session…"}
      </div>
    );
  }

  const { plotters, timeline, globalViewport, globalLineViewports } = uiState;

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "panel":
        return (
          <Panel
            node={node}
            plotters={plotters}
            timeline={timeline}
            simulations={simulations}
            globalViewport={globalViewport}
            onGlobalViewportChange={onGlobalViewportChange}
            onLocalViewportChange={onLocalViewportChange}
            onSyncViewportToggle={onSyncViewportToggle}
            globalTooltip={globalTooltip}
            onGlobalTooltipChange={handleGlobalTooltipChange}
            onDataTypeChange={onDataTypeChange}
            onPlotTypeChange={onPlotTypeChange}
            onPseudocolorConfigChange={onPseudocolorConfigChange}
            onPlotSimulationChange={onPlotSimulationChange}
            globalLineViewports={globalLineViewports}
            onLineConfigChange={onLineConfigChange}
            onLineRangeChange={onLineRangeChange}
            onPlotterPatch={onPlotterPatch}
          />
        );
      case "json":
        return <ModelJson uiState={uiState} />;
      default:
        return <div>{`unknown component: ${component}`}</div>;
    }
  };

  const onRenderTabSet = (
    node: TabSetNode | BorderNode,
    renderValues: ITabSetRenderValues,
  ) => {
    if (node instanceof TabSetNode) {
      renderValues.stickyButtons.push(
        <AddTabButton
          key={`add-tab-${node.getId()}`}
          model={model}
          node={node}
        />,
      );
    }
  };

  return (
    <div className="app-shell">
      <Menubar sessionFiles={sessionFiles} syncStatus={syncStatus} />
      <div className="app-main">
        <SimulationSidebar
          simulations={simulations}
          isLoading={isLoading}
          onAddSimulation={addSimulation}
          onUnloadSimulation={unloadSimulation}
          collapsed={uiState.sidebarCollapsed ?? false}
          onCollapsedChange={onSidebarCollapsedChange}
        />
        <div className="layout-container">
          <div id="content"></div>
          <Layout
            model={model}
            factory={factory}
            onModelChange={(updatedModel: Model) =>
              handleModelChange(updatedModel)
            }
            onRenderTabSet={onRenderTabSet}
            realtimeResize={true}
          />
        </div>
      </div>
      {simulations.length > 0 && (
        <FooterBar timeline={timeline} onTimelineChange={onTimelineChange} />
      )}
    </div>
  );
};

const ModelJson = ({ uiState }: { uiState: IUiState }) => {
  return <pre>{JSON.stringify(uiState, null, "\t")}</pre>;
};

export default App;
