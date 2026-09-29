"""Field metadata and 1D line extraction from an xarray dataset.

Quantities a line plot can request are either field names ("Ex", "N_1") or
vector names ("E"), which expand to every component present ("Ex", "Ey",
"Ez"). A vector is only offered when no scalar field has the same name, so an
existing field always wins.
"""

from collections.abc import Iterable, Sequence
from typing import Any

import numpy as np
import xarray as xr

TIME_DIM = "t"
COMPONENT_SUFFIXES = ("x", "y", "z")


def vector_groups(names: Iterable[str]) -> dict[str, list[str]]:
    """Map vector name -> its components (ordered x, y, z), for 2+ components."""
    names = set(names)
    groups: dict[str, list[str]] = {}
    for name in names:
        suffix = name[-1:]
        if suffix not in COMPONENT_SUFFIXES:
            continue
        base = name[:-1]
        # "B_x" style names group under "B".
        if base.endswith("_"):
            base = base[:-1]
        if base:
            groups.setdefault(base, []).append(name)

    return {
        base: sorted(components, key=lambda c: COMPONENT_SUFFIXES.index(c[-1]))
        for base, components in sorted(groups.items())
        if len(components) >= 2 and base not in names
    }


def resolve_quantities(requested: Sequence[str], dataset: xr.Dataset) -> list[str]:
    """Expand requested quantities into field names, keeping order, no repeats."""
    fields = set(map(str, dataset.data_vars))
    vectors = vector_groups(fields)
    resolved: list[str] = []
    for quantity in requested:
        if quantity in fields:
            names = [quantity]
        elif quantity in vectors:
            names = vectors[quantity]
        else:
            raise KeyError(f"Unknown quantity '{quantity}'")
        resolved.extend(name for name in names if name not in resolved)
    return resolved


def spatial_dims(data: xr.DataArray) -> list[str]:
    return [str(dim) for dim in data.dims if dim != TIME_DIM]


def field_metadata(dataset: xr.Dataset) -> dict[str, Any]:
    fields = [
        {"name": str(name), "dims": spatial_dims(dataset[name])}
        for name in sorted(map(str, dataset.data_vars))
    ]
    used_dims = {dim for field in fields for dim in field["dims"]}
    return {
        "fields": fields,
        "vectors": [
            {"name": name, "components": components}
            for name, components in vector_groups(
                f["name"] for f in fields
            ).items()
        ],
        "coords": {
            dim: _to_json_list(dataset.coords[dim].values)
            for dim in sorted(used_dims)
            if dim in dataset.coords
        },
    }


def render_line(
    dataset: xr.Dataset,
    quantities: Sequence[str],
    axis: str,
    slices: dict[str, float],
    time: float,
    value_range: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Cut every requested field along `axis` at time `time`.

    Other spatial dimensions are sliced at the nearest coordinate to
    `slices[dim]` (the middle of the axis when unspecified); the coordinates
    actually used are returned so the client can show them. `value_range`
    crops the result to [min, max] along `axis` (see `_range_window`).
    """
    names = resolve_quantities(quantities, dataset)
    if not names:
        raise ValueError("Select at least one quantity to plot")
    if axis not in dataset.coords:
        raise ValueError(f"Unknown coordinate '{axis}'")

    coordinates = np.asarray(dataset.coords[axis].values, dtype=float)
    window = (
        _range_window(coordinates, value_range)
        if value_range is not None
        else slice(None)
    )

    series = []
    used_slices: dict[str, float] = {}
    timestamp: float | None = None
    for name in names:
        data = dataset[name]
        if axis not in data.dims:
            raise ValueError(f"'{name}' does not depend on '{axis}'")

        if TIME_DIM in data.dims:
            data = data.sel({TIME_DIM: time}, method="nearest")
            timestamp = float(data.coords[TIME_DIM].item())

        for dim in spatial_dims(data):
            if dim == axis:
                continue
            values = data.coords[dim].values
            target = slices.get(dim, values[len(values) // 2])
            data = data.sel({dim: target}, method="nearest")
            used_slices[dim] = float(data.coords[dim].item())

        line = np.asarray(data.transpose(axis).values, dtype=float)
        series.append({"name": name, "values": _to_json_list(line[window])})

    return {
        "axis": axis,
        "coordinates": _to_json_list(coordinates[window]),
        "series": series,
        "slices": used_slices,
        "timestamp": timestamp,
    }


def _range_window(coordinates: np.ndarray, value_range: dict[str, float]) -> slice:
    """Index window covering [min, max] plus one grid point beyond each edge.

    The extra points let lines run to the edges of a zoomed plot (the client
    clips them), and a range narrower than the grid spacing still selects the
    two points around it. Coordinates are assumed to be ascending.
    """
    lower, upper = sorted((float(value_range["min"]), float(value_range["max"])))
    if upper < coordinates[0] or lower > coordinates[-1]:
        raise ValueError("Selected zoom range is outside the data")
    inside = np.flatnonzero((coordinates >= lower) & (coordinates <= upper))
    if inside.size:
        start, stop = int(inside[0]), int(inside[-1])
    else:
        # The range falls between two neighbouring grid points.
        stop = int(np.searchsorted(coordinates, lower))
        start = stop - 1
    return slice(max(start - 1, 0), min(stop + 1, len(coordinates) - 1) + 1)


def _to_json_list(values: np.ndarray) -> list[float | None]:
    """Floats for JSON, with NaN/inf (not valid JSON) as null."""
    array = np.asarray(values, dtype=float)
    return [float(v) if np.isfinite(v) else None for v in array]
