from enum import Enum


class NodeType(Enum):
    ROW = "row"
    TABSET = "tabset"
    TAB = "tab"


class Node:
    def __init__(self, node_type: NodeType, id: str):
        self._node_type = node_type
        self._id = id

    @property
    def node_type(self) -> NodeType:
        return self._node_type

    @property
    def id(self) -> str:
        return self._id

    def to_json(self) -> dict:
        return {
            "type": self.node_type.value,
            "id": self.id,
        }


class ParentNode(Node):
    def __init__(self, node_type: NodeType, id: str):
        super().__init__(node_type, id)
        self._children: dict[str, Node] = {}

    def add_child(self, child: Node):
        self._children[child.id] = child

    @property
    def children(self) -> dict[str, Node]:
        return self._children

    def get_child(self, id: str) -> Node | None:
        return self._children.get(id, None)

    def to_json(self) -> dict:
        json_data = super().to_json()
        json_data["children"] = [child.to_json() for child in self._children.values()]
        return json_data


class RowNode(ParentNode):
    def __init__(self, id: str):
        super().__init__(NodeType.ROW, id)


class TabsetNode(ParentNode):
    def __init__(
        self,
        id: str,
        weight: float | None = None,
        selected: int | None = None,
        active: bool | None = None,
    ):
        super().__init__(NodeType.TABSET, id)
        self._weight: float | None = weight
        self._selected: int | None = selected
        self._active: bool | None = active

    @property
    def weight(self) -> float | None:
        return self._weight

    @property
    def selected(self) -> int | None:
        return self._selected

    @property
    def active(self) -> bool | None:
        return self._active

    @weight.setter
    def weight(self, value: float | None):
        self._weight = value

    @selected.setter
    def selected(self, value: int | None):
        self._selected = value

    @active.setter
    def active(self, value: bool | None):
        self._active = value

    def to_json(self) -> dict:
        json_data = super().to_json()
        if self.weight is not None:
            json_data["weight"] = self.weight
        if self.selected is not None:
            json_data["selected"] = self.selected
        if self.active is not None:
            json_data["active"] = self.active
        return json_data


class TabNode(Node):
    def __init__(self, id: str, name: str, component: str):
        super().__init__(NodeType.TAB, id)
        self._name: str = name
        self._component: str = component

    @property
    def name(self) -> str:
        return self._name

    @property
    def component(self) -> str:
        return self._component

    def to_json(self) -> dict:
        json_data = super().to_json()
        json_data["name"] = self.name
        json_data["component"] = self.component
        return json_data


class Model:
    def __init__(self):
        self._root: RowNode = RowNode("#root")

    @property
    def root(self) -> RowNode:
        return self._root

    def to_json(self) -> dict:
        return self._root.to_json()

    def from_json(self, data: dict) -> "Model":
        def build_node(node_data: dict) -> Node:
            node_type = NodeType(node_data["type"])
            node_id = node_data["id"]

            if node_type == NodeType.ROW:
                node = RowNode(node_id)
                for child_data in node_data.get("children", []):
                    child_node = build_node(child_data)
                    node.add_child(child_node)
                return node
            elif node_type == NodeType.TABSET:
                node = TabsetNode(
                    node_id,
                    weight=node_data.get("weight", None),
                    selected=node_data.get("selected", None),
                    active=node_data.get("active", None),
                )
                for child_data in node_data.get("children", []):
                    child_node = build_node(child_data)
                    node.add_child(child_node)
                return node
            elif node_type == NodeType.TAB:
                return TabNode(
                    node_id,
                    name=node_data.get("name", ""),
                    component=node_data.get("component", ""),
                )
            else:
                raise ValueError(f"Unknown node type: {node_type}")

        root_row_id = data["id"]
        if data["type"] != NodeType.ROW.value:
            raise ValueError("Root node must be of type ROW")
        root_row = RowNode(root_row_id)
        for child_data in data.get("children", []):
            child_node = build_node(child_data)
            root_row.add_child(child_node)
        self._root = root_row
        return self
