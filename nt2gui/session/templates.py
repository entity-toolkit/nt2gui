"""Templates: a session's panels without what ties them to one simulation.

A template keeps the layout (positions, sizes, tab names) and each panel's
plot: kind, quantities, expressions, axes, scales, colormaps, species, bins
and value limits. It drops the simulation, times, zooms, slice positions,
region filters and sync toggles, so it can be applied to any simulation.

Templates live in one JSON file next to the session file, shared by every
session that uses that directory.
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import Field, ValidationError, field_validator

from ..errors import Conflict, NotFound, UserError
from .files import write_json_atomic
from .schema import Plotter, PlotType, UiState, _Schema

logger = logging.getLogger(__name__)

TEMPLATES_VERSION = 1
MAX_TEMPLATE_NAME = 64

# Plotter settings tied to one simulation or one moment; dropped from templates.
_PLOTTER_DROPPED = (
    "simulationId",
    "localViewport",
    "useGlobalViewport",
    "lineViewport",
    "syncTime",
    "localTime",
    "localPlaybackFps",
    "showRegions",
)


class Template(_Schema):
    name: str = Field(min_length=1, max_length=MAX_TEMPLATE_NAME)
    # flexlayout's IJsonModel, as in the UI state.
    layout: dict[str, Any]
    plotters: dict[str, Plotter]
    saved_at: str | None = None

    @field_validator("name")
    @classmethod
    def _check_name(cls, name: str) -> str:
        return check_name(name)


class TemplatesFile(_Schema):
    schema_version: int = TEMPLATES_VERSION
    templates: list[Template] = []


def check_name(name: str) -> str:
    """A valid template name (trimmed), or a `UserError` saying why not."""
    name = name.strip()
    if not name:
        raise UserError("A template name is required")
    if len(name) > MAX_TEMPLATE_NAME:
        raise UserError(f"Template names are at most {MAX_TEMPLATE_NAME} characters")
    # Names appear in URLs (/templates/<name>).
    if "/" in name:
        raise UserError("Template names can't contain '/'")
    return name


def template_plotter(plotter: Plotter) -> Plotter:
    """`plotter` without its simulation, times, zooms, slices, region
    filters and sync toggles."""
    wire = plotter.to_wire()
    for key in _PLOTTER_DROPPED:
        wire.pop(key, None)
    if "lineConfig" in wire:
        # Required on the client, so emptied rather than dropped.
        wire["lineConfig"]["slices"] = {}
    if "pseudocolorConfig" in wire:
        wire["pseudocolorConfig"].pop("slices", None)
    if "particlePhaseConfig" in wire:
        wire["particlePhaseConfig"].pop("regions", None)
    if "particleHistogramConfig" in wire:
        for series in wire["particleHistogramConfig"]["series"]:
            series.pop("regions", None)
    return Plotter.model_validate(wire)


def template_from_state(state: UiState, name: str) -> Template:
    """A template of the panels in `state`."""
    return Template(
        name=name,
        layout=state.model_copy(deep=True).layout,
        plotters={
            panel: template_plotter(plotter)
            for panel, plotter in state.plotters.items()
        },
        saved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )


def apply_template(
    state: UiState, template: Template, simulation_id: str | None
) -> None:
    """Replace the panels in `state` with the template's, showing
    `simulation_id`; zooms are reset. Regions and the timeline stay."""
    state.layout = template.model_copy(deep=True).layout
    plotters: dict[str, Plotter] = {}
    for panel, plotter in template.plotters.items():
        plotter = plotter.model_copy(deep=True)
        if simulation_id is not None and plotter.plot_type != PlotType.NONE:
            plotter.simulation_id = simulation_id
        plotters[panel] = plotter
    state.plotters = plotters
    state.global_viewport = None
    state.global_line_viewports = {}


def summary(template: Template) -> dict[str, Any]:
    """What the template list shows."""
    return {
        "name": template.name,
        "panels": sum(
            plotter.plot_type != PlotType.NONE for plotter in template.plotters.values()
        ),
        "savedAt": template.saved_at,
    }


class TemplateStore:
    """The templates file: read on each change, written atomically."""

    def __init__(self, path: Path | None) -> None:
        """`path=None` keeps templates in memory only."""
        self._path = path
        self._lock = threading.Lock()
        self._templates = self._load()

    def summaries(self) -> list[dict[str, Any]]:
        with self._lock:
            return [summary(template) for template in self._templates]

    def get(self, name: str) -> Template:
        with self._lock:
            return self._find(name).model_copy(deep=True)

    def save(self, template: Template, overwrite: bool = False) -> list[dict[str, Any]]:
        with self._lock:
            existing = self._index(template.name)
            templates = list(self._templates)
            if existing is None:
                templates.append(template)
            elif overwrite:
                templates[existing] = template
            else:
                raise Conflict(
                    f"A template called '{template.name}' already exists",
                    exists=True,
                )
            return self._commit(templates)

    def rename(self, name: str, new_name: str) -> list[dict[str, Any]]:
        new_name = check_name(new_name)
        with self._lock:
            template = self._find(name)
            if new_name != name and self._index(new_name) is not None:
                raise Conflict(f"Another template is already called '{new_name}'")
            templates = [
                t.model_copy(update={"name": new_name}) if t is template else t
                for t in self._templates
            ]
            return self._commit(templates)

    def remove(self, name: str) -> list[dict[str, Any]]:
        with self._lock:
            template = self._find(name)
            return self._commit([t for t in self._templates if t is not template])

    def _index(self, name: str) -> int | None:
        return next(
            (i for i, t in enumerate(self._templates) if t.name == name), None
        )

    def _find(self, name: str) -> Template:
        index = self._index(name)
        if index is None:
            raise NotFound(f"No template called '{name}'")
        return self._templates[index]

    def _commit(self, templates: list[Template]) -> list[dict[str, Any]]:
        if self._path is not None:
            write_json_atomic(
                self._path,
                TemplatesFile(
                    schema_version=TEMPLATES_VERSION, templates=templates
                ).to_wire(),
            )
        self._templates = templates
        return [summary(template) for template in templates]

    def _load(self) -> list[Template]:
        if self._path is None or not self._path.exists():
            return []
        try:
            raw = json.loads(self._path.read_text())
            return TemplatesFile.model_validate(raw).templates
        except (OSError, ValueError, ValidationError) as error:
            backup = self._path.with_suffix(self._path.suffix + ".corrupt")
            logger.error(
                "Could not load templates from %s (%s); moved to %s",
                self._path,
                error,
                backup,
            )
            os.replace(self._path, backup)
            return []
