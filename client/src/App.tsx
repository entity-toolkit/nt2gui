import { useState, useEffect } from "react";
import {
  Layout,
  Model,
  TabNode,
  IJsonModel,
  TabSetNode,
  BorderNode,
  ITabSetRenderValues,
} from "flexlayout-react";
import "flexlayout-react/style/dark.css";

import { IPlotters, PlotType, DataType, IUiState } from "./global";

import AddTabButton from "./Components/AddTabButton";
import Panel from "./Components/Panel";

import "./App.css";

const SERVER_URL = "http://localhost:5000";

const App = () => {
  const initialLayout: IJsonModel = {
    global: {
      splitterEnableHandle: true,
      tabEnablePopout: false,
      tabSetMinWidth: 130,
      tabSetMinHeight: 100,
      tabSetEnableTabScrollbar: true,
      borderMinSize: 100,
      borderEnableTabScrollbar: true,
    },
    borders: [
      {
        type: "border",
        location: "bottom",
        children: [
          {
            type: "tab",
            name: "JSON",
            component: "json",
            enableClose: false,
          },
        ],
      },
    ],
    layout: {
      type: "row",
      children: [],
    },
    popouts: {},
  };
  const initialUiState: IUiState = {
    layout: initialLayout,
    plotters: {},
  };

  const [model, setModel] = useState<Model>(Model.fromJson(initialLayout));
  const [plotters, setPlotters] = useState<IPlotters>(initialUiState.plotters);

  const postServer = async (endpoint: string, data: any) => {
    const response = await fetch(`${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Request failed: ${response.status} ${message}`);
    }

    return response.json();
  };

  const syncUiState = (uiState: IUiState) => {
    postServer(`${SERVER_URL}/model_sync`, { model: uiState })
      .then(() => {
        console.log("synced ui state to server");
      })
      .catch((error) => {
        console.error("Error syncing ui state to server:", error);
      });
  };

  const updatePlotters = (updater: (prevPlotters: IPlotters) => IPlotters) => {
    setPlotters((prevPlotters) => {
      const nextPlotters = updater(prevPlotters);
      if (nextPlotters === prevPlotters) {
        return prevPlotters;
      }

      syncUiState({ layout: model.toJson(), plotters: nextPlotters });
      return nextPlotters;
    });
  };

  const onPlotTypeChange = (node_id: string, newPlotType: PlotType) => {
    updatePlotters((prevPlotters) => {
      const existing = prevPlotters[node_id];
      if (existing?.plotType === newPlotType) {
        return prevPlotters;
      }

      return {
        ...prevPlotters,
        [node_id]: {
          plotType: newPlotType,
          dataType: existing?.dataType ?? DataType.None,
        },
      };
    });
  };

  const onDataTypeChange = (node_id: string, newDataType: DataType) => {
    updatePlotters((prevPlotters) => {
      const existing = prevPlotters[node_id];
      if (existing?.dataType === newDataType) {
        return prevPlotters;
      }

      return {
        ...prevPlotters,
        [node_id]: {
          plotType: existing?.plotType ?? PlotType.None,
          dataType: newDataType,
        },
      };
    });
  };

  useEffect(() => {
    const bootstrapModel = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/model_init`);
        if (!response.ok) {
          throw new Error(`Failed to fetch stored model: ${response.status}`);
        }

        const data = await response.json();

        if (data.model?.layout) {
          setModel(Model.fromJson(data.model.layout));
          setPlotters(data.model.plotters ?? {});
          return;
        }

        const initResponse = await postServer(`${SERVER_URL}/model_init`, {
          model: initialUiState,
        });

        setModel(Model.fromJson(initResponse.model.layout));
        setPlotters(initResponse.model.plotters ?? {});
      } catch (error) {
        console.error("Error initializing model:", error);
      }
    };

    bootstrapModel();
  }, []);

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

  useEffect(() => {
    const syncPlottersWithModel = () => {
      const modelJson = model.toJson();
      const panelIds = new Set<string>();

      const collectPanelIds = (node: any) => {
        if (!node) return;

        if (node.type === "tab" && node.component === "panel" && node.id) {
          panelIds.add(node.id);
        }

        if (Array.isArray(node.children)) {
          node.children.forEach(collectPanelIds);
        }
      };

      collectPanelIds(modelJson.layout);
      modelJson.borders?.forEach((border: any) =>
        collectPanelIds(border),
      );

      setPlotters((prevPlotters) => {
        let hasChanges = false;
        const updatedPlotters: IPlotters = { ...prevPlotters };

        panelIds.forEach((id) => {
          if (!updatedPlotters[id]) {
            hasChanges = true;
            updatedPlotters[id] = {
              plotType: PlotType.None,
              dataType: DataType.None,
            };
          }
        });

        Object.keys(updatedPlotters).forEach((id) => {
          if (!panelIds.has(id)) {
            hasChanges = true;
            delete updatedPlotters[id];
          }
        });

        if (hasChanges) {
          syncUiState({ layout: modelJson, plotters: updatedPlotters });
          return updatedPlotters;
        }

        return prevPlotters;
      });
    };

    syncPlottersWithModel();
  }, [model]);

  return (
    <>
      <div id="content"></div>
      <Layout
        model={model}
        factory={factory}
        // onAction={(action: Action) => {
        //   console.log("onAction: ", action);
        //   return action;
        // }}
        onModelChange={(updatedModel: Model) => {
          const jsonModel = updatedModel.toJson();
          setModel(Model.fromJson(jsonModel));
          syncUiState({ layout: jsonModel, plotters });
        }}
        onRenderTabSet={onRenderTabSet}
        realtimeResize={true}
      />
    </>
  );
};

function ModelJson({ uiState }: { uiState: IUiState }) {
  const [json, setJson] = useState<string>(
    JSON.stringify(uiState, null, "\t"),
  );

  useEffect(() => {
    setJson(JSON.stringify(uiState, null, "\t"));
  }, [uiState]);

  return <pre>{json}</pre>;
}

export default App;
