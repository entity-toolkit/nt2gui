"""1D cuts through fields (line plots)."""

from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import xarray as xr

from ..data.arrays import finite_list, minmax_indices
from ..data.expressions import Variables
from ..data.quantities import QuantityError, cut, quantity_arrays, snapshot_at
from ..data.smoothing import smooth
from ..errors import UserError

# A line never needs more points than a screen has pixels: longer cuts are
# downsampled (keeping each bucket's extremes). Zooming in re-requests the
# narrower range, so detail grows with the zoom up to full resolution.
MAX_LINE_POINTS = 3000


def render_line(
    dataset: xr.Dataset,
    quantities: Sequence[str],
    axis: str,
    slices: Mapping[str, float],
    time: float,
    value_range: Mapping[str, float] | None = None,
    max_points: int = MAX_LINE_POINTS,
    smoothing: Mapping[str, float] | None = None,
    variables: Variables | None = None,
) -> dict[str, Any]:
    """Cut every requested quantity along `axis` at time `time`.

    Other spatial dims are sliced at the grid point nearest to `slices[dim]`
    (the middle when unspecified); the coordinates actually used are returned
    so the client can show them. `value_range` ({min, max}) crops the result
    along `axis` (see `_range_window`). At most about `max_points` points
    are returned (see `minmax_indices`). `smoothing[axis]`, if set, is a
    boxcar width (axis units) applied to the whole cut before cropping, so a
    zoomed view is smoothed like the full one.
    """
    if not quantities:
        raise UserError("Select at least one quantity to plot")
    if axis not in dataset.coords:
        raise UserError(f"Unknown coordinate '{axis}'")

    dataset, timestamp = snapshot_at(dataset, time)
    coordinates = np.asarray(dataset.coords[axis].values, dtype=float)
    window = _range_window(coordinates, value_range) if value_range else slice(None)

    names: list[str] = []
    lines: list[np.ndarray] = []
    used_slices: dict[str, float] = {}
    windows = {axis: smoothing[axis]} if smoothing and axis in smoothing else {}
    smoothed: dict[str, int] = {}
    for data in quantity_arrays(quantities, dataset, variables):
        if axis not in data.dims:
            raise QuantityError(f"'{data.name}' does not depend on '{axis}'")
        data, used = cut(data, [axis], slices)
        used_slices |= used
        data, smoothed = smooth(data, windows)
        names.append(str(data.name))
        lines.append(np.asarray(data.transpose(axis).values, dtype=float)[window])

    shown = coordinates[window]
    keep = minmax_indices(lines, max_points)
    return {
        "axis": axis,
        "coordinates": finite_list(shown[keep]),
        "series": [
            {"name": name, "values": finite_list(line[keep])}
            for name, line in zip(names, lines)
        ],
        "slices": used_slices,
        # Boxcar width actually used, in cells, per smoothed dim.
        "smoothing": smoothed,
        "timestamp": timestamp,
        # Grid points in the plotted range, before downsampling.
        "totalPoints": len(shown),
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
