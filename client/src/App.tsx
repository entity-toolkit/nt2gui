import { useState, useEffect, useRef } from "react";
import {
  Layout,
  Model,
  Action,
  TabNode,
  IJsonModel,
  IJsonRowNode,
  TabSetNode,
  BorderNode,
  ITabSetRenderValues,
  Actions,
  DockLocation,
  AddIcon,
} from "flexlayout-react";
import "./App.css";
import "flexlayout-react/style/underline.css";
import "flexlayout-react/style/dark.css";

const SERVER_URL = "http://localhost:5000";

const json: IJsonModel = {
  global: {
    splitterEnableHandle: true,
    tabEnablePopout: true,
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
    // id: "#7fb9a2f8-e17c-40e9-80ef-b6803cee5a89",
    children: [],
    // children: [
    //   {
    //     type: "tabset",
    //     id: "#8a57d328-59d7-4b39-81f9-74fd1db98f20",
    //     weight: 1,
    //     children: [
    //       {
    //         type: "tab",
    //         id: "#2bae5b3a-04d0-4a34-bc24-edcfd5a153bd",
    //         name: "left",
    //         component: "placeholder",
    //       },
    //     ],
    //   },
    //   {
    //     type: "tabset",
    //     id: "#94fd82c2-c7a4-4b8f-9bb6-3549ff248c00",
    //     weight: 1,
    //     children: [
    //       {
    //         type: "tab",
    //         id: "#18636ae8-4178-450d-a0a8-2059c04b5370",
    //         name: "center",
    //         component: "placeholder",
    //       },
    //     ],
    //     active: true,
    //   },
    //   {
    //     type: "tabset",
    //     id: "#868a8f84-31cc-4c06-99d5-11af8ddde846",
    //     weight: 1,
    //     children: [
    //       {
    //         type: "tab",
    //         id: "#aed2e05e-2dd1-49ee-af42-d464b7bacba1",
    //         name: "right",
    //         component: "placeholder",
    //       },
    //     ],
    //   },
    // ],
  },
  popouts: {},
};

const App = () => {
  const [model, setModel] = useState<Model>(Model.fromJson(json));

  const updateModelLayout = (newLayout: IJsonRowNode) => {
    const new_model = model.toJson();
    new_model.layout = newLayout;
    setModel(Model.fromJson(new_model));
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
    postServer(`${SERVER_URL}/model_init`, model.toJson()).then((data) => {
      if (data.model !== null) {
        updateModelLayout(data.model);
        console.log("retrieved model from server");
      } else {
        console.log("initialized model on server");
      }
    });
    //   requestServer(`${SERVER_URL}/get_model`).then((data) => {
    //     const new_model = model.toJson();
    //     new_model.layout = data;
    //     setModel(Model.fromJson(new_model));
    //     console.log(data, new_model);
    //   });
  }, []);
  // console.log(model);

  // const model = Model.fromJson(json);
  const nextAddIndex = useRef<number>(1);

  const factory = (node: TabNode) => {
    const component = node.getComponent();
    switch (component) {
      case "panel":
        return <div className="panel">{node.getName()}</div>;
      case "json":
        return <ModelJson model={model} />;
      default:
        return <div>{"unknown component " + component}</div>;
    }
  };

  const onRenderTabSet = (
    node: TabSetNode | BorderNode,
    renderValues: ITabSetRenderValues,
  ) => {
    if (node instanceof TabSetNode) {
      renderValues.stickyButtons.push(
        <button
          key="Add"
          title="Add"
          className="flexlayout__tab_toolbar_button"
          onClick={() => {
            console.log("Add button clicked on", node.getId(), model);
            model.doAction(
              Actions.addNode(
                {
                  component: "panel",
                  name: "Added " + nextAddIndex.current++,
                },
                node.getId(),
                DockLocation.CENTER,
                -1,
                true,
              ),
            );
          }}
        >
          <AddIcon />
        </button>,
      );
    }
  };

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
        onModelChange={(model: Model) => {
          syncModelLayout(model.toJson());
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
