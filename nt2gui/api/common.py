"""Request helpers shared by the API blueprints.

Helpers raise `UserError` (400) / `NotFound` (404); the app's error handlers
turn those, and pydantic `ValidationError`s, into JSON error responses.
"""

import json
from typing import Any, TypeVar

import xarray as xr
from flask import current_app, request
from pydantic import BaseModel, ValidationError

from ..data.expressions import Variables, variable_definitions
from ..data.particles import particle_dataset, required_columns
from ..errors import UserError
from ..sources import SimulationSource
from ..workspace import Workspace

EXTENSION_KEY = "nt2gui.workspace"
Model = TypeVar("Model", bound=BaseModel)


def workspace() -> Workspace:
    return current_app.extensions[EXTENSION_KEY]


def simulation(simulation_id: str) -> SimulationSource:
    return workspace().simulation(simulation_id)


def json_object() -> dict[str, Any]:
    """The request body, which must be a JSON object (missing counts as {})."""
    payload = request.get_json(silent=True)
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise UserError("Expected a JSON object")
    return payload


def require_time(payload: dict[str, Any]) -> float:
    time = payload.get("time")
    # bool is an int subclass, but never a valid time.
    if isinstance(time, bool) or not isinstance(time, (int, float)):
        raise UserError("Time value is required")
    return float(time)


def require_text(payload: dict[str, Any], key: str, message: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise UserError(message)
    return value.strip()


def parse(model: type[Model], value: Any, what: str) -> Model:
    try:
        return model.model_validate(value)
    except ValidationError as error:
        raise UserError(
            f"Invalid {what}", details=json.loads(error.json(include_url=False))
        ) from error


def request_variables(payload: dict[str, Any]) -> dict[str, str]:
    """The named variables (`{name: expression}`) sent with a request. Like
    regions, the client sends the ones a request uses rather than the server
    reading its session, so a render never races the state sync."""
    return variable_definitions(payload.get("variables"))


def particles_at(
    source: SimulationSource,
    time: float,
    quantities: list[str],
    variables: Variables | None = None,
) -> tuple[xr.Dataset, float]:
    """The particles of the output nearest to `time` (only the columns
    `quantities` need), and that output's time."""
    if not source.species:
        raise UserError("This simulation has no particle output")
    columns = required_columns(quantities, source.particle_columns, variables)
    return particle_dataset(source.particles(time, columns)), source.particle_time(time)
