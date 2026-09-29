"""Validated shape of the persisted UI session.

Field names are snake_case in Python and camelCase on the wire (matching
`client/src/global.ts`). Unknown fields are rejected so that client/server
drift surfaces as a 400 instead of silently dropping state.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

SCHEMA_VERSION = 2


class _Schema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    def to_wire(self) -> dict[str, Any]:
        # exclude_unset keeps optional fields the client omitted absent, so the
        # state round-trips exactly as it was sent.
        return self.model_dump(mode="json", by_alias=True, exclude_unset=True)


class DataType(str, Enum):
    NONE = "none"
    FIELDS = "fields"
    PARTICLES = "particles"


class PlotType(str, Enum):
    NONE = "none"
    LINE = "line"
    SCATTER = "scatter"
    PSEUDOCOLOR = "pseudocolor"


class Timeline(_Schema):
    current: float
    min: float
    max: float
    step: float = Field(gt=0)

    @model_validator(mode="after")
    def _check_bounds(self) -> "Timeline":
        if self.min > self.max:
            raise ValueError("timeline min must not exceed max")
        return self


class ZoomWindow(_Schema):
    x_min: float
    x_max: float
    y_min: float
    y_max: float


class PseudocolorConfig(_Schema):
    field: str
    x_coordinate: str
    y_coordinate: str
    vmin: float | None = None
    vmax: float | None = None
    color_map: str
    # Coordinate value at which each dim beyond x/y is sliced (3D fields).
    slices: dict[str, float] = {}


class Range(_Schema):
    """A zoom window along a single coordinate (1D plots)."""

    min: float
    max: float

    @model_validator(mode="after")
    def _check_order(self) -> "Range":
        if self.min >= self.max:
            raise ValueError("range min must be below max")
        return self


class LineConfig(_Schema):
    # Field names ("Ex") or vector names ("E", expands to its components).
    quantities: list[str]
    # Coordinate to plot against; empty means "first available".
    axis: str
    # Coordinate value at which every other spatial dimension is sliced.
    slices: dict[str, float] = {}
    # Fixed value-axis limits (display only); unset means automatic.
    y_min: float | None = None
    y_max: float | None = None


class Plotter(_Schema):
    plot_type: PlotType
    data_type: DataType
    simulation_id: str | None = None
    pseudocolor_config: PseudocolorConfig | None = None
    local_viewport: ZoomWindow | None = None
    use_global_viewport: bool | None = None
    line_config: LineConfig | None = None
    line_viewport: Range | None = None


class UiState(_Schema):
    # flexlayout's IJsonModel; its internals are owned by the client library.
    layout: dict[str, Any]
    plotters: dict[str, Plotter]
    timeline: Timeline
    global_viewport: ZoomWindow | None
    # Synced 1D zoom, per coordinate: only line plots along the same axis share it.
    global_line_viewports: dict[str, Range]

    @field_validator("layout")
    @classmethod
    def _check_layout(cls, layout: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(layout.get("layout"), dict):
            raise ValueError("layout must contain a 'layout' node")
        return layout


class SimulationRecord(_Schema):
    id: str
    path: str


class Session(_Schema):
    """Everything persisted to disk: the UI state plus the loaded simulations."""

    schema_version: int = SCHEMA_VERSION
    revision: int = 0
    state: UiState
    simulations: list[SimulationRecord] = []


class SessionDocument(_Schema):
    """A saved session file: a `Session` without its revision."""

    schema_version: int = SCHEMA_VERSION
    state: UiState
    simulations: list[SimulationRecord] = []


DEFAULT_TIMELINE: dict[str, Any] = {"current": 0, "min": 0, "max": 100, "step": 1}

DEFAULT_LAYOUT: dict[str, Any] = {
    "global": {
        "splitterEnableHandle": True,
        "tabEnablePopout": False,
        "tabSetMinWidth": 130,
        "tabSetMinHeight": 100,
        "tabSetEnableTabScrollbar": True,
        "borderMinSize": 100,
        "borderEnableTabScrollbar": True,
    },
    "layout": {"type": "row", "children": []},
    "popouts": {},
}


def default_session() -> Session:
    return Session.model_validate(
        {
            "schemaVersion": SCHEMA_VERSION,
            "revision": 0,
            "state": {
                "layout": DEFAULT_LAYOUT,
                "plotters": {},
                "timeline": DEFAULT_TIMELINE,
                "globalViewport": None,
                "globalLineViewports": {},
            },
            "simulations": [],
        }
    )
