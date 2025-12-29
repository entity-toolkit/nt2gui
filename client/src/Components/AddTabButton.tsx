import {
  Model,
  TabSetNode,
  Actions,
  DockLocation,
  AddIcon,
} from "flexlayout-react";

const AddTabButton = (props: { model: Model; node: TabSetNode }) => (
  <>
    <button
      key={crypto.randomUUID()}
      title="Add"
      className="flexlayout__tab_toolbar_button"
      onClick={() => {
        console.log("Add button clicked on", props.node.getId(), props.model);
        props.model.doAction(
          Actions.addNode(
            {
              component: "panel",
              name: "Panel",
            },
            props.node.getId(),
            DockLocation.CENTER,
            -1,
            true,
          ),
        );
      }}
    >
      <AddIcon />
    </button>
  </>
);

export default AddTabButton;
