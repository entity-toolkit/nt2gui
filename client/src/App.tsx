import {
  BorderNode,
  ITabSetRenderValues,
  Layout,
  TabNode,
  TabSetNode,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";

import AddTabButton from "./components/layout/AddTabButton";
import Menubar from "./components/layout/Menubar";
import SimulationSidebar from "./components/layout/SimulationSidebar";
import TimelineBar from "./components/layout/TimelineBar";
import ServerUrlForm from "./components/common/ServerUrlForm";
import { getServerUrl } from "./config";
import Panel from "./plots/Panel";
import { UiProvider, useUi, useUiActions } from "./state/UiContext";

const Workspace = () => {
  const { model, simulations } = useUi();
  const { handleModelChange } = useUiActions();

  const factory = (node: TabNode) =>
    node.getComponent() === "panel" ? (
      <Panel nodeId={node.getId()} />
    ) : (
      <div>{`unknown component: ${node.getComponent()}`}</div>
    );

  const onRenderTabSet = (
    node: TabSetNode | BorderNode,
    values: ITabSetRenderValues,
  ) => {
    if (node instanceof TabSetNode) {
      values.stickyButtons.push(
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
      <Menubar />
      <div className="app-main">
        <SimulationSidebar />
        <div className="layout-container">
          <Layout
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
            onRenderTabSet={onRenderTabSet}
            realtimeResize
          />
        </div>
      </div>
      {simulations.length > 0 && <TimelineBar />}
    </div>
  );
};

const serverLabel = () => (getServerUrl() ? ` at ${getServerUrl()}` : "");

const App = () => (
  <UiProvider
    fallback={(loadError) => (
      <div className="app-loading">
        <div className="app-loading-box">
          <p role="status">
            {loadError
              ? `Cannot reach the server${serverLabel()} (${loadError}). Retrying…`
              : "Loading session…"}
          </p>
          {/* The server may simply be elsewhere (UI run with `nt2gui client`). */}
          {loadError && <ServerUrlForm />}
        </div>
      </div>
    )}
  >
    <Workspace />
  </UiProvider>
);

export default App;
