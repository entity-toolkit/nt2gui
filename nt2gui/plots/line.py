"""1D cuts through fields (line plots)."""

from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import xarray as xr

from ..data.arrays import finite_list
from ..data.quantities import QuantityError, cut, quantity_arrays, snapshot_at
from ..errors import UserError


def render_line(
    dataset: xr.Dataset,
    quantities: Sequence[str],
    axis: str,
    slices: Mapping[str, float],
    time: float,
    value_range: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    """Cut every requested quantity along `axis` at time `time`.

    Other spatial dims are sliced at the grid point nearest to `slices[dim]`
    (the middle when unspecified); the coordinates actually used are returned
    so the client can show them. `value_range` ({min, max}) crops the result
    along `axis` (see `_range_window`).
    """
    if not quantities:
        raise UserError("Select at least one quantity to plot")
    if axis not in dataset.coords:
        raise UserError(f"Unknown coordinate '{axis}'")

    dataset, timestamp = snapshot_at(dataset, time)
    coordinates = np.asarray(dataset.coords[axis].values, dtype=float)
    window = _range_window(coordinates, value_range) if value_range else slice(None)

    series = []
    used_slices: dict[str, float] = {}
    for data in quantity_arrays(quantities, dataset):
        if axis not in data.dims:
            raise QuantityError(f"'{data.name}' does not depend on '{axis}'")
        data, used = cut(data, [axis], slices)
        used_slices |= used
        line = np.asarray(data.transpose(axis).values, dtype=float)
        series.append({"name": str(data.name), "values": finite_list(line[window])})

    return {
        "axis": axis,
        "coordinates": finite_list(coordinates[window]),
        "series": series,
        "slices": used_slices,
        "timestamp": timestamp,
    }


def _range_window(coordinates: np.ndarray, value_range: Mapping[str, float]) -> slice:
    """Index window covering [min, max] plus one grid point beyond each edge.

    The extra points let lines run to the edges of a zoomed plot (the client
    clips them), and a range narrower than the grid spacing still selects the
    two points around it. Coordinates are assumed to be ascending.
    """
    lower, upper = sorted((float(value_range["min"]), float(value_range["max"])))
    if upper < coordinates[0] or lower > coordinates[-1]:
        raise UserError("Selected zoom range is outside the data")
    inside = np.flatnonzero((coordinates >= lower) & (coordinates <= upper))
    if inside.size:
        start, stop = int(inside[0]), int(inside[-1])
    else:
        # The range falls between two neighbouring grid points.
        stop = int(np.searchsorted(coordinates, lower))
        start = stop - 1
    return slice(max(start - 1, 0), min(stop + 1, len(coordinates) - 1) + 1)
