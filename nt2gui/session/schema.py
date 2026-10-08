"""Validated shape of the persisted UI session.

Field names are snake_case in Python and camelCase on the wire (matching
`client/src/global.ts`). Unknown fields are rejected so that client/server
drift surfaces as a 400 instead of silently dropping state.
"""

from copy import deepcopy
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

SCHEMA_VERSION = 2

# Literals shared with the data and render layers (the wire contract).
ScaleKind = Literal["linear", "log", "power"]
ColorScale = Literal["linear", "log"]
MAX_PARTICLE_BINS = 2000
# Lasso regions are simplified on the client; this bounds what the server takes.
MAX_REGION_POINTS = 2000
MAX_SIMULATION_NAME = 100
# Playback speed limit (frames per second; playback also waits for renders).
MAX_PLAYBACK_FPS = 60
DEFAULT_COLOR_MAP = "viridis"


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


# Boxcar width per coordinate, in that coordinate's units (unset: no smoothing).
Smoothing = dict[str, Annotated[float, Field(gt=0)]]


class PseudocolorConfig(_Schema):
    field: str
    x_coordinate: str = "x"
    y_coordinate: str = "y"
    vmin: float | None = None
    vmax: float | None = None
    color_map: str = DEFAULT_COLOR_MAP
    # Log colors leave values <= 0 transparent; power colors by sign(A)|A|^p.
    color_scale: ScaleKind = "linear"
    color_power: float = Field(0.5, gt=0)
    # Coordinate value at which each dim beyond x/y is sliced (3D fields).
    slices: dict[str, float] = {}
    smoothing: Smoothing = {}
    # Custom quantities (e.g. "f + g") offered alongside the fields.
    expressions: list[str] = []


class Range(_Schema):
    """A zoom window along a single coordinate (1D plots)."""

    min: float
    max: float

    @model_validator(mode="after")
    def _check_order(self) -> "Range":
        if self.min >= self.max:
            raise ValueError("range min must be below max")
        return self


class RegionPolygon(_Schema):
    """A lasso: a closed polygon over two spatial coordinates (data units)."""

    x: str
    y: str
    points: list[tuple[float, float]] = Field(
        min_length=3, max_length=MAX_REGION_POINTS
    )


class Region(_Schema):
    """A named spatial selection; particles inside every constraint belong to it."""

    name: str = Field(min_length=1, max_length=64)
    # Inclusive range per spatial coordinate (boxes and bands).
    ranges: dict[str, Range] = {}
    polygon: RegionPolygon | None = None
    # Outline color, fixed when saved so renaming keeps it.
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{3,8}$")

    @model_validator(mode="after")
    def _check_constrained(self) -> "Region":
        if not self.ranges and self.polygon is None:
            raise ValueError("a region needs a range or a polygon")
        return self


class Variable(_Schema):
    """A named custom quantity (`edotb = Ex*Bx + ...`), usable by name in any
    plot and in other variables."""

    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    expression: str = Field(min_length=1, max_length=500)


def _unique_names(variables: list[Variable]) -> list[Variable]:
    names = [variable.name for variable in variables]
    if len(set(names)) != len(names):
        raise ValueError("variable names must be unique")
    return variables


class LineConfig(_Schema):
    # Field names ("Ex") or vector names ("E", expands to its components).
    quantities: list[str]
    # Coordinate to plot against; empty means "first available".
    axis: str
    # Coordinate value at which every other spatial dimension is sliced.
    slices: dict[str, float] = {}
    # Applied along the plotted axis.
    smoothing: Smoothing = {}
    # Fixed value-axis limits (display only); unset means automatic.
    y_min: float | None = None
    y_max: float | None = None
    # Value axis (display only): log hides values <= 0; power is sign(A)|A|^p.
    y_scale: ScaleKind = "linear"
    y_power: float = Field(0.5, gt=0)
    # Custom quantities (e.g. "sqrt(Ex**2 + Ey**2)") offered alongside the
    # fields; selected ones also appear in `quantities`.
    expressions: list[str] = []


class ParticleAxis(_Schema):
    """One binned axis of a particle histogram."""

    # A built-in quantity (x, ux, gamma, energy, ...) or an expression.
    quantity: str
    # Bins are uniform in A (linear), log10(A) (log) or sign(A)|A|^p (power).
    scale: ScaleKind
    power: float = Field(0.5, gt=0)
    bins: int = Field(100, ge=1, le=MAX_PARTICLE_BINS)
    # Binned range in data units; unset sides follow the data.
    min: float | None = None
    max: float | None = None


class ParticleSeries(_Schema):
    # Species indices summed into this line; empty means all species.
    species: list[int] = []
    # Names of saved regions; only particles inside any of them count. Empty: no filter.
    regions: list[str] = []


class ParticleHistogramConfig(_Schema):
    """1D weighted histogram (e.g. an energy spectrum), one line per series."""

    x: ParticleAxis
    series: list[ParticleSeries]
    y_scale: ColorScale = "log"
    y_min: float | None = None
    y_max: float | None = None
    expressions: list[str] = []


class ParticlePhaseConfig(_Schema):
    """2D weighted histogram (phase-space plot) of the selected species."""

    x: ParticleAxis
    y: ParticleAxis
    species: list[int] = []
    # Names of saved regions (union); empty means no spatial filter.
    regions: list[str] = []
    color_scale: ColorScale = "log"
    vmin: float | None = None
    vmax: float | None = None
    color_map: str = DEFAULT_COLOR_MAP
    expressions: list[str] = []


class Plotter(_Schema):
    plot_type: PlotType
    data_type: DataType
    simulation_id: str | None = None
    pseudocolor_config: PseudocolorConfig | None = None
    local_viewport: ZoomWindow | None = None
    use_global_viewport: bool | None = None
    line_config: LineConfig | None = None
    line_viewport: Range | None = None
    particle_histogram_config: ParticleHistogramConfig | None = None
    particle_phase_config: ParticlePhaseConfig | None = None
    # False gives the panel its own time (`local_time`) instead of the global one.
    sync_time: bool | None = None
    local_time: float | None = None
    local_playback_fps: float | None = Field(None, gt=0, le=MAX_PLAYBACK_FPS)
    # Outline saved regions; unset: on for 1D plots, off for 2D (client default).
    show_regions: bool | None = None


class UiState(_Schema):
    # flexlayout's IJsonModel; its internals are owned by the client library.
    layout: dict[str, Any]
    plotters: dict[str, Plotter]
    timeline: Timeline
    global_viewport: ZoomWindow | None
    # Synced 1D zoom, per coordinate: only line plots along the same axis share it.
    global_line_viewports: dict[str, Range]
    # Whether the simulations sidebar is folded away.
    sidebar_collapsed: bool = False
    # Whether the global timeline is folded down to its play button.
    timeline_collapsed: bool = False
    playback_fps: float | None = Field(None, gt=0, le=MAX_PLAYBACK_FPS)
    # Distraction-free view: only the plots (menus, tabs, tools, timeline hidden).
    focus_mode: bool = False
    # Spatial selections (region-01, ...) particle plots can filter by.
    regions: list[Region] = []
    # Named custom quantities shared by every plot (fields and particles apart).
    field_variables: list[Variable] = []
    particle_variables: list[Variable] = []

    @field_validator("field_variables", "particle_variables")
    @classmethod
    def _check_variables(cls, variables: list[Variable]) -> list[Variable]:
        return _unique_names(variables)

    @field_validator("regions")
    @classmethod
    def _check_region_names(cls, regions: list[Region]) -> list[Region]:
        names = [region.name for region in regions]
        if len(set(names)) != len(names):
            raise ValueError("region names must be unique")
        return regions

    @field_validator("layout")
    @classmethod
    def _check_layout(cls, layout: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(layout.get("layout"), dict):
            raise ValueError("layout must contain a 'layout' node")
        return layout


class SimulationRecord(_Schema):
    id: str
    path: str
    # Display name, unique among the loaded simulations. Sessions saved before
    # names existed lack it; the workspace fills it in when re-opening.
    name: str | None = Field(None, min_length=1, max_length=MAX_SIMULATION_NAME)


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
                # Copies: `Any`-typed values are kept by reference.
                "layout": deepcopy(DEFAULT_LAYOUT),
                "plotters": {},
                "timeline": deepcopy(DEFAULT_TIMELINE),
                "globalViewport": None,
                "globalLineViewports": {},
            },
            "simulations": [],
        }
    )
