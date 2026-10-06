import {
  Actions,
  AddIcon,
  DockLocation,
  Model,
  TabSetNode,
} from "flexlayout-react";

/** "+" in a tabset's header: opens a new, empty panel there. */
const AddTabButton = ({ model, node }: { model: Model; node: TabSetNode }) => (
  <button
    title="Add panel"
    className="flexlayout__tab_toolbar_button"
    onClick={() =>
      model.doAction(
        Actions.addNode(
          { component: "panel", name: "Panel" },
          node.getId(),
          DockLocation.CENTER,
          -1,
          true,
        ),
      )
    }
  >
    <AddIcon />
  </button>
);

export default AddTabButton;
