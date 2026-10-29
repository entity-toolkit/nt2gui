import {
  Actions,
  BorderNode,
  DockLocation,
  ITabRenderValues,
  ITabSetRenderValues,
  Layout,
  TabNode,
  TabSetNode,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { useState } from "react";

import AddTabButton from "./components/layout/AddTabButton";
import FocusToggle from "./components/layout/FocusToggle";
import Menubar from "./components/layout/Menubar";
import SimulationSidebar from "./components/layout/SimulationSidebar";
import TabMenu from "./components/layout/TabMenu";
import TimelineBar from "./components/layout/TimelineBar";
import ServerUrlForm from "./components/common/ServerUrlForm";
import { getServerUrl } from "./config";
import { useKeyShortcut } from "./hooks/useKeyShortcut";
import Panel from "./plots/Panel";
import { duplicatePlotter } from "./state/plotters";
import { UiProvider, useUi, useUiActions } from "./state/UiContext";

// Ids for duplicated panels (crypto.randomUUID needs a secure context).
const newPanelId = () =>
  `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const Workspace = () => {
  const { model, simulations, uiState } = useUi();
  const focus = uiState.focusMode ?? false;
  const { handleModelChange, updateUiState } = useUiActions();
  // F hides or shows every control.
  useKeyShortcut("f", () =>
    updateUiState((prev) => ({
      ...prev,
      focusMode: !(prev.focusMode ?? false),
    })),
  );

  const factory = (node: TabNode) =>
    node.getComponent() === "panel" ? (
      <Panel nodeId={node.getId()} />
    ) : (
      <div>{`unknown component: ${node.getComponent()}`}</div>
    );

  // The right-clicked panel tab, whose menu is open.
  const [tabMenu, setTabMenu] = useState<{
    node: TabNode;
    x: number;
    y: number;
  } | null>(null);

  /** A copy of a panel (same plot, simulation, zoom and time) next to it. */
  const duplicate = (node: TabNode) => {
    const tabset = node.getParent();
    if (!(tabset instanceof TabSetNode)) return;
    const id = newPanelId();
    model.doAction(
      Actions.addNode(
        {
          type: "tab",
          id,
          component: "panel",
          name: `${node.getName()} (copy)`,
        },
        tabset.getId(),
        DockLocation.CENTER,
        tabset.getChildren().indexOf(node) + 1,
        true,
      ),
    );
    // After the layout change, which gave the new panel a blank plot.
    updateUiState((prev) => ({
      ...prev,
      plotters: duplicatePlotter(prev.plotters, node.getId(), id),
    }));
  };

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

  // A hint on each panel tab (the whole label, via its content).
  const onRenderTab = (node: TabNode, values: ITabRenderValues) => {
    values.content = (
      <span title="Double click to rename, drag to reposition, right-click for more">
        {node.getName()}
      </span>
    );
  };

  return (
    // Focus mode hides the controls with CSS (`data-ui-chrome`), keeping them
    // mounted so playback and dialogs carry on.
    <div className={`app-shell${focus ? " focus-mode" : ""}`}>
      {focus && <FocusToggle floating />}
      <div data-ui-chrome>
        <Menubar />
      </div>
      <div className="app-main">
        <div className="app-sidebar" data-ui-chrome>
          <SimulationSidebar />
        </div>
        <div className="layout-container">
          <Layout
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
            onRenderTabSet={onRenderTabSet}
            onRenderTab={onRenderTab}
            onContextMenu={(node, event) => {
              if (!(node instanceof TabNode)) return;
              event.preventDefault();
              event.stopPropagation();
              setTabMenu({ node, x: event.clientX, y: event.clientY });
            }}
            realtimeResize
          />
        </div>
      </div>
      {tabMenu && (
        <TabMenu
          position={tabMenu}
          maximized={
            tabMenu.node.getParent() instanceof TabSetNode &&
            (tabMenu.node.getParent() as TabSetNode).isMaximized()
          }
          onDuplicate={() => duplicate(tabMenu.node)}
          onToggleMaximized={() => {
            const tabset = tabMenu.node.getParent();
            if (tabset instanceof TabSetNode) {
              model.doAction(Actions.maximizeToggle(tabset.getId()));
            }
          }}
          onClose={() =>
            model.doAction(Actions.deleteTab(tabMenu.node.getId()))
          }
          onDismiss={() => setTabMenu(null)}
        />
      )}
      {simulations.length > 0 && (
        <div data-ui-chrome>
          <TimelineBar />
        </div>
      )}
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
