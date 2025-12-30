from copy import deepcopy
from typing import Any


class Model:
    def __init__(self, json_data: dict[str, Any] | None = None):
        self._json_data: dict[str, Any] = self._normalize(json_data)

    def _normalize(self, data: dict[str, Any] | None) -> dict[str, Any]:
        data = data or {}
        layout = deepcopy(data.get("layout", {}))
        plotters = deepcopy(data.get("plotters", {}))
        return {"layout": layout, "plotters": plotters}

    def to_json(self) -> dict[str, Any]:
        return deepcopy(self._json_data)

    def from_json(self, data: dict[str, Any]) -> "Model":
        self._json_data = self._normalize(data)
        return self
