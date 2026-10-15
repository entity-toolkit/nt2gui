"""Coordinate transforms: a run's coordinates in other units or frames.

The session holds one expression per coordinate (`x`, `y`, `z`, `r`, `th`,
`ph`) and per time (`t`), e.g. `x -> (x - grid.extent[0]) / setup.skin` or
`x -> x - 0.3*t`. Each may use its own coordinate, the run's original time
`t`, numbers and numpy functions, and the run's attributes by their dotted
names, so one session-wide transform adapts to each simulation.

A transform doesn't replace its coordinate: it adds a primed one next to it
(`x` -> `xp`, shown as x′), so plots can use either. A `Frame` adds them: to
field snapshots (as coordinates along the original dimension, after picking
the snapshot so `t` is that output's time), to particles (as columns), and to
time. The timeline runs in `t` or `tp` (`time_axis`); every time in requests
and responses is in that axis, and the output nearest to a requested time is
found among the output times on it.
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
# The coordinate a transform adds: x -> xp, …, t -> tp.
PRIMED = {name: f"{name}p" for name in TRANSFORMABLE}
BASES = {primed: name for name, primed in PRIMED.items()}


def base_of(name: str) -> str:
    """The original coordinate a (possibly primed) coordinate lives on."""
    return BASES.get(name, name)


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
    """Transforms for one simulation (its attributes resolve the names), and
    which time the timeline runs in."""

    transforms: Mapping[str, str] = field(default_factory=dict)
    attrs: Mapping[str, Any] = field(default_factory=dict)
    # "t" (the run's own time) or "tp" (transformed; needs a transform of t).
    time_axis: str = TIME

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
            result = evaluate(expression, xr.Dataset(coords=coords), attrs=self.attrs)
        except ExpressionError as error:
            raise TransformError(f"Transform of '{name}': {error.message}") from error
        if result.dims != (dim,):
            raise TransformError(
                f"Transform of '{name}' must depend on {name}"
                + ("" if name == TIME else " (it may also use t)")
            )
        return np.asarray(result.values, dtype=float)

    @property
    def spatial(self) -> dict[str, str]:
        """Primed name -> original, for the transformed positions."""
        return {PRIMED[name]: name for name in self.transforms if name != TIME}

    def transformed_times(self, raw: Any) -> np.ndarray:
        """Output times through the transform of `t`; they must keep
        increasing (the timeline steps through them)."""
        raw = np.asarray(raw, dtype=float)
        times = self.apply(TIME, raw, raw)
        if raw.size > 1 and not np.all(np.diff(times) > 0):
            raise TransformError("The transform of 't' must keep times increasing")
        if not np.all(np.isfinite(times)):
            raise TransformError("The transform of 't' gives non-finite times")
        return times

    def times(self, raw: Any) -> np.ndarray:
        """Output times on the timeline's axis (`t` or `tp`)."""
        if self.time_axis == PRIMED[TIME]:
            if TIME not in self.transforms:
                raise TransformError("t′ needs a transform of t")
            return self.transformed_times(raw)
        return np.asarray(raw, dtype=float)

    def nearest(self, raw: Any, time: float) -> int:
        """Index of the output nearest to `time` on the timeline's axis."""
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
        """`data` (one snapshot) with a primed coordinate (`xp`) along each
        transformed dimension, and `tp` next to `t` when time is transformed."""
        for primed, name in self.spatial.items():
            if name in data.dims and name in data.coords:
                values = self.coordinate(name, data.coords[name].values, raw_time)
                data = data.assign_coords({primed: (name, values)})
        if TIME in self.transforms and TIME in data.coords and data.coords[TIME].ndim == 0:
            data = data.assign_coords(
                {PRIMED[TIME]: self.transformed_times([raw_time])[0]}
            )
        return data

    def positions(self, particles: xr.Dataset, raw_time: float) -> xr.Dataset:
        """Particles with a primed column (`xp`) for each transformed position."""
        updates = {
            primed: (
                particles[name].dims,
                self.apply(name, particles[name].values, raw_time),
            )
            for primed, name in self.spatial.items()
            if name in particles.data_vars
        }
        return particles.assign(updates) if updates else particles

    def time_of(self, raw_time: float) -> float:
        """An output's time on the timeline's axis."""
        return float(self.times([raw_time])[0])


def on_axes(data: xr.DataArray, axes: list[str]) -> xr.DataArray:
    """`data` with each requested axis as its dimension: a primed axis (`xp`)
    takes the place of its original dimension, sorted ascending."""
    bases = [base_of(axis) for axis in axes]
    if len(set(bases)) != len(bases):
        raise TransformError("x and x′ are the same dimension; pick one")
    for axis, base in zip(axes, bases):
        if axis == base:
            continue
        if axis not in data.coords:
            raise TransformError(f"{base}′ needs a transform of {base}")
        data = data.swap_dims({base: axis})
        values = data.coords[axis].values
        if values.size > 1 and values[0] > values[-1]:
            data = data.isel({axis: slice(None, None, -1)})
    return data


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
    """The timeline after the transforms or the time axis change from
    `previous` to `frame`, staying at the output that `time` (in `previous`
    units) was nearest to."""
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
    the original and transformed [min, max] at the first output). Particle-only
    coordinates are only checked to evaluate."""
    errors: dict[str, str] = {}
    ranges: dict[str, dict[str, list[float]]] = {}
    raw_times = output_times(simulation)
    first = float(raw_times[0]) if raw_times.size else 0.0
    fields = simulation.fields
    for name in frame.transforms:
        try:
            if name == TIME:
                original, values = raw_times, frame.transformed_times(raw_times)
            elif name in fields.dims and name in fields.coords:
                original = np.asarray(fields.coords[name].values, dtype=float)
                values = frame.coordinate(name, original, first)
            else:
                frame.apply(name, np.array([0.0, 1.0]), first)
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
