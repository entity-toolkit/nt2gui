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
import TimelineControls from "./components/TimelineControls";
import { useUiState } from "./hooks/useUiState";

import "./App.css";

const App = () => {
  const {
    model,
    plotters,
    timeline,
    onDataTypeChange,
    onPlotTypeChange,
    onPseudocolorConfigChange,
    onTimelineChange,
    handleModelChange,
  } = useUiState();

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "panel":
        return (
          <Panel
            node={node}
            plotters={plotters}
            onDataTypeChange={onDataTypeChange}
            onPlotTypeChange={onPlotTypeChange}
            onPseudocolorConfigChange={onPseudocolorConfigChange}
          />
        );
      case "json":
        return <ModelJson uiState={{ layout: model.toJson(), plotters }} />;
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
      <header className="app-header">
        <div className="app-branding">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-title">NT2 Visualizer</div>
            <div className="brand-subtitle">Backend-driven scientific plots</div>
          </div>
        </div>
        <TimelineControls timeline={timeline} onTimelineChange={onTimelineChange} />
      </header>
      <div className="layout-container">
        <div id="content"></div>
        <Layout
          model={model}
          factory={factory}
          onModelChange={(updatedModel: Model) => handleModelChange(updatedModel)}
          onRenderTabSet={onRenderTabSet}
          realtimeResize={true}
        />
      </div>
    </div>
  );
};

const ModelJson = ({ uiState }: { uiState: IUiState }) => {
  return <pre>{JSON.stringify(uiState, null, "\t")}</pre>;
};

export default App;
