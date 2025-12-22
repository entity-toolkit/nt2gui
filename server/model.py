from copy import deepcopy
from typing import Any


class Model:
    def __init__(self, json_data: dict[str, Any] | None = None):
        self._json_data: dict[str, Any] | None = deepcopy(json_data)

    def to_json(self) -> dict[str, Any] | None:
        return deepcopy(self._json_data)

    def from_json(self, data: dict[str, Any]) -> "Model":
        self._json_data = deepcopy(data)
        return self
