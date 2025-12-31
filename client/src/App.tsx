import {
  Layout,
  Model,
  TabNode,
  TabSetNode,
  BorderNode,
  ITabSetRenderValues,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";

import { IUiState } from "./global";
import AddTabButton from "./components/AddTabButton";
import Panel from "./components/Panel";
import Menubar from "./components/Menubar";
import FooterBar from "./components/FooterBar";
import { useUiState } from "./hooks/useUiState";
import { useSimulations } from "./hooks/useSimulations";

const App = () => {
  const {
    model,
    plotters,
    timeline,
    onDataTypeChange,
    onPlotTypeChange,
    onPseudocolorConfigChange,
    onPlotSimulationChange,
    onTimelineChange,
    handleModelChange,
  } = useUiState();
  const { simulations, isLoading, addSimulation, unloadSimulation } =
    useSimulations({ onTimelineUpdate: onTimelineChange });

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
            onDataTypeChange={onDataTypeChange}
            onPlotTypeChange={onPlotTypeChange}
            onPseudocolorConfigChange={onPseudocolorConfigChange}
            onPlotSimulationChange={onPlotSimulationChange}
          />
        );
      case "json":
        return (
          <ModelJson uiState={{ layout: model.toJson(), plotters, timeline }} />
        );
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
      <Menubar onAddSimulation={addSimulation} isLoading={isLoading} />
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
      <FooterBar
        timeline={timeline}
        onTimelineChange={onTimelineChange}
        simulations={simulations}
        onUnloadSimulation={unloadSimulation}
        isLoading={isLoading}
      />
    </div>
  );
};

const ModelJson = ({ uiState }: { uiState: IUiState }) => {
  return <pre>{JSON.stringify(uiState, null, "\t")}</pre>;
};

export default App;
