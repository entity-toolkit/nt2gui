from copy import deepcopy
from typing import Any


class Model:
    def __init__(self, json_data: dict[str, Any] | None = None):
        self._json_data: dict[str, Any] = self._normalize(json_data)

    @property
    def default_timeline(self) -> dict[str, Any]:
        return {
            "current": 0,
            "min": 0,
            "max": 100,
            "step": 1,
        }

    def _normalize(self, data: dict[str, Any] | None) -> dict[str, Any]:
        data = data or {}
        layout = deepcopy(data.get("layout", {}))
        plotters = deepcopy(data.get("plotters", {}))
        timeline = deepcopy(
            data.get(
                "timeline",
                {
                    "current": 0,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                },
            )
        )
        return {"layout": layout, "plotters": plotters, "timeline": timeline}

    def to_json(self) -> dict[str, Any]:
        return deepcopy(self._json_data)

    def from_json(self, data: dict[str, Any]) -> "Model":
        self._json_data = self._normalize(data)
        return self

    def set_timeline(self, timeline: dict[str, Any] | None) -> None:
        normalized = self._normalize({"timeline": timeline or {}})
        self._json_data["timeline"] = normalized["timeline"]

    def get_timeline(self) -> dict[str, Any]:
        return deepcopy(self._json_data.get("timeline", self.default_timeline))
