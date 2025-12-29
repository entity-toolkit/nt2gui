import { useState, useEffect, useRef } from "react";
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

import { IPlotters, PlotType, DataType } from "./global";

import AddTabButton from "./Components/AddTabButton";
import Panel from "./Components/Panel";

import "./App.css";

const SERVER_URL = "http://localhost:5000";

const App = () => {
  const init_json: IJsonModel = {
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
  const [model, setModel] = useState<Model>(Model.fromJson(init_json));
  const [plotters, setPlotters] = useState<IPlotters>({});
  const onPlotTypeChange = (node_id: string, newPlotType: PlotType) => {
    setPlotters({
      ...plotters,
      [node_id]: {
        ...plotters[node_id],
        plotType: newPlotType,
      },
    });
  };
  const onDataTypeChange = (node_id: string, newDataType: DataType) => {
    setPlotters({
      ...plotters,
      [node_id]: {
        ...plotters[node_id],
        dataType: newDataType,
      },
    });
  };

  // const requestServer = async (endpoint: string) => {
  //   const response = await fetch(`${endpoint}`);
  //   return response.json();
  // };
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

  const syncModelLayout = (newModel: IJsonModel) => {
    postServer(`${SERVER_URL}/model_sync`, newModel)
      .then(() => {
        console.log("synced model layout to server");
      })
      .catch((error) => {
        console.error("Error syncing model layout to server:", error);
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

        if (data.model !== null) {
          setModel(Model.fromJson(data.model));
          return;
        }

        const initResponse = await postServer(`${SERVER_URL}/model_init`, {
          model: model.toJson(),
        });

        setModel(Model.fromJson(initResponse.model));
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
        return <ModelJson model={model} />;
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
        const updatedPlotters = { ...prevPlotters };

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

        return hasChanges ? updatedPlotters : prevPlotters;
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
          syncModelLayout(jsonModel);
        }}
        onRenderTabSet={onRenderTabSet}
        realtimeResize={true}
      />
    </>
  );
};

function ModelJson({ model }: { model: Model }) {
  const [json, setJson] = useState<string>(
    JSON.stringify(model.toJson(), null, "\t"),
  );
  const timerRef = useRef<number>(0);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setJson(JSON.stringify(model.toJson(), null, "\t"));
    }, 500);
    return () => {
      clearInterval(timerRef.current);
    };
  }, []);

  return <pre>{json}</pre>;
}

export default App;
