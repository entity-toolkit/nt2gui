"""Coordinate transforms: showing a run in other units or another frame.

The session holds one expression per coordinate (`x`, `y`, `z`, `r`, `th`,
`ph`) and per time (`t`), e.g. `x -> (x - grid.extent[0]) / setup.skin` or
`x -> x - 0.3*t`. Each may use its own coordinate, the run's original time
`t`, numbers and numpy functions, and the run's attributes by their dotted
names, so one session-wide transform adapts to each simulation.

A `Frame` applies them: to field coordinates (after picking the snapshot, so
`t` is that output's time), to particle positions, and to output times. The
global timeline and every time in requests and responses are in transformed
units; the output nearest to a requested time is found among the transformed
output times.
"""

import ast
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import xarray as xr

from ..session.schema import MAX_TRANSFORM_LENGTH, TRANSFORMABLE
from ..sources import SimulationSource, combined_timeline, output_times
from .expressions import ExpressionError, evaluate

TIME = "t"


class TransformError(ExpressionError):
    """A coordinate transform can't be applied to this simulation."""


def transform_definitions(raw: Any) -> dict[str, str]:
    """Validated `{coordinate: expression}` from a request (default none);
    empty expressions are dropped."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise TransformError("transforms must be an object")
    definitions: dict[str, str] = {}
    for name, expression in raw.items():
        if name not in TRANSFORMABLE:
            raise TransformError(
                f"Only {', '.join(TRANSFORMABLE)} can be transformed, not '{name}'"
            )
        if not isinstance(expression, str) or len(expression) > MAX_TRANSFORM_LENGTH:
            raise TransformError(f"The transform of '{name}' must be a short text")
        if expression.strip():
            definitions[name] = expression.strip()
    return definitions


@dataclass(frozen=True)
class Frame:
    """Transforms for one simulation (its attributes resolve the names)."""

    transforms: Mapping[str, str] = field(default_factory=dict)
    attrs: Mapping[str, Any] = field(default_factory=dict)

    def apply(self, name: str, values: Any, time: Any) -> np.ndarray:
        """Transformed values of coordinate `name` (an array), at original
        time(s) `time` (a scalar, or an array matching `values` for `t`)."""
        values = np.asarray(values, dtype=float)
        expression = self.transforms.get(name)
        if expression is None:
            return values
        dim = "_n"
        coords: dict[str, Any] = {name: ((dim,), values)}
        if name != TIME:
            coords[TIME] = float(time)
        try:
            result = evaluate(
                expression, xr.Dataset(coords=coords), attrs=self.attrs
            )
        except ExpressionError as error:
            raise TransformError(
                f"Transform of '{name}': {error.message}"
            ) from error
        if result.dims != (dim,):
            raise TransformError(
                f"Transform of '{name}' must depend on {name}"
                + ("" if name == TIME else " (it may also use t)")
            )
        return np.asarray(result.values, dtype=float)

    def uses_time(self) -> bool:
        """Whether a spatial transform depends on time (a moving frame)."""
        return any(
            TIME in _names(expression)
            for name, expression in self.transforms.items()
            if name != TIME
        )

    def times(self, raw: Any) -> np.ndarray:
        """Transformed output times; they must stay in increasing order."""
        raw = np.asarray(raw, dtype=float)
        times = self.apply(TIME, raw, raw)
        if raw.size > 1 and not np.all(np.diff(times) > 0):
            raise TransformError("The transform of 't' must keep times increasing")
        if not np.all(np.isfinite(times)):
            raise TransformError("The transform of 't' gives non-finite times")
        return times

    def nearest(self, raw: Any, time: float) -> int:
        """Index of the output whose transformed time is nearest to `time`."""
        return int(np.abs(self.times(raw) - float(time)).argmin())

    def coordinate(self, name: str, values: Any, raw_time: float) -> np.ndarray:
        """Transformed grid of spatial coordinate `name`: finite and strictly
        monotonic (a grid can't fold onto itself)."""
        result = self.apply(name, values, raw_time)
        if not np.all(np.isfinite(result)):
            raise TransformError(f"The transform of '{name}' gives non-finite values")
        steps = np.diff(result)
        if result.size > 1 and not (np.all(steps > 0) or np.all(steps < 0)):
            raise TransformError(
                f"The transform of '{name}' must be increasing or decreasing over the grid"
            )
        return result

    def grid(self, data: xr.Dataset | xr.DataArray, raw_time: float) -> Any:
        """`data` (one snapshot) with its spatial coordinates transformed,
        each sorted ascending again, and its time coordinate transformed."""
        for name in self.transforms:
            if name == TIME or name not in data.dims or name not in data.coords:
                continue
            values = self.coordinate(name, data.coords[name].values, raw_time)
            data = data.assign_coords({name: values})
            if values.size > 1 and values[0] > values[-1]:
                data = data.isel({name: slice(None, None, -1)})
        if TIME in data.coords and data.coords[TIME].ndim == 0:
            data = data.assign_coords({TIME: self.times([raw_time])[0]})
        return data

    def positions(self, particles: xr.Dataset, raw_time: float) -> xr.Dataset:
        """Particle positions (columns named like coordinates) transformed."""
        updates = {
            name: (
                particles[name].dims,
                self.apply(name, particles[name].values, raw_time),
            )
            for name in self.transforms
            if name != TIME and name in TRANSFORMABLE and name in particles.data_vars
        }
        return particles.assign(updates) if updates else particles


def _names(expression: str) -> set[str]:
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        return set()
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}


IDENTITY = Frame()


def frame_timeline(simulation: SimulationSource, frame: Frame) -> dict[str, float]:
    """A simulation's timeline ({current, min, max, step}) in the frame's units."""
    return combined_timeline(frame.times(output_times(simulation)))


def retimed(
    simulation: SimulationSource, frame: Frame, previous: Frame, time: float
) -> dict[str, float]:
    """The timeline after the transforms change from `previous` to `frame`,
    staying at the output that `time` (in `previous` units) was nearest to."""
    raw = output_times(simulation)
    timeline = frame_timeline(simulation, frame)
    if raw.size:
        timeline["current"] = float(frame.times(raw)[previous.nearest(raw, time)])
    return timeline


def check_transforms(
    simulation: SimulationSource, frame: Frame
) -> dict[str, dict[str, Any]]:
    """Whether each transform works for this simulation, and what it gives:
    `errors` (coordinate -> why not) and `ranges` (coordinate -> {from, to},
    the original and transformed [min, max] at the first output)."""
    errors: dict[str, str] = {}
    ranges: dict[str, dict[str, list[float]]] = {}
    raw_times = output_times(simulation)
    first = float(raw_times[0]) if raw_times.size else 0.0
    fields = simulation.fields
    for name in frame.transforms:
        try:
            if name == TIME:
                original, values = raw_times, frame.times(raw_times)
            elif name in fields.dims and name in fields.coords:
                original = np.asarray(fields.coords[name].values, dtype=float)
                values = frame.coordinate(name, original, first)
            else:
                # Not on the field grid (particles only): check it evaluates.
                original = np.array([0.0, 1.0])
                values = frame.apply(name, original, first)
                original = values = np.empty(0)
        except TransformError as error:
            errors[name] = error.message
            continue
        if values.size:
            ranges[name] = {
                "from": [float(np.min(original)), float(np.max(original))],
                "to": [float(np.min(values)), float(np.max(values))],
            }
    return {"errors": errors, "ranges": ranges}
