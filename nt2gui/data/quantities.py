"""Resolving field quantities, and cutting fields in time and space.

A quantity is a field name ("Ex", "N_1"), a vector name ("E", which expands to
every component present: "Ex", "Ey", "Ez"), or an expression over fields and
coordinates ("sqrt(Ex**2 + Ey**2)", see `expressions.py`). A vector is only
offered when no scalar field has the same name, so an existing field wins.
"""

from collections.abc import Iterable, Mapping, Sequence

import numpy as np
import xarray as xr

from ..errors import UserError
from .expressions import evaluate

TIME_DIM = "t"
COMPONENT_SUFFIXES = ("x", "y", "z")


class QuantityError(UserError):
    """A requested quantity doesn't exist or can't be plotted this way."""


def vector_groups(names: Iterable[str]) -> dict[str, list[str]]:
    """Map vector name -> its components (ordered x, y, z), for 2+ components."""
    names = set(names)
    groups: dict[str, list[str]] = {}
    for name in names:
        if name[-1:] not in COMPONENT_SUFFIXES:
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
    """Expand field and vector names into field names, in order, no repeats."""
    fields = set(map(str, dataset.data_vars))
    vectors = vector_groups(fields)
    resolved: list[str] = []
    for quantity in requested:
        if quantity in fields:
            names = [quantity]
        elif quantity in vectors:
            names = vectors[quantity]
        else:
            raise QuantityError(f"Unknown quantity '{quantity}'")
        resolved.extend(name for name in names if name not in resolved)
    return resolved


def quantity_arrays(
    requested: Sequence[str], dataset: xr.Dataset
) -> list[xr.DataArray]:
    """One array per plotted series: fields and vector components by name,
    anything else evaluated as an expression."""
    fields = set(map(str, dataset.data_vars))
    vectors = vector_groups(fields)
    arrays: list[xr.DataArray] = []
    seen: set[str] = set()
    for quantity in requested:
        if quantity in fields:
            new = [dataset[quantity]]
        elif quantity in vectors:
            new = [dataset[name] for name in vectors[quantity]]
        elif quantity.isidentifier() and quantity not in dataset.coords:
            raise QuantityError(f"Unknown quantity '{quantity}'")
        else:
            new = [evaluate(quantity, dataset)]
        for array in new:
            if str(array.name) not in seen:
                seen.add(str(array.name))
                arrays.append(array)
    return arrays


def single_quantity(quantity: str, dataset: xr.Dataset) -> xr.DataArray:
    """The one array a quantity stands for (vectors are rejected)."""
    arrays = quantity_arrays([quantity], dataset)
    if len(arrays) != 1:
        raise QuantityError(
            f"'{quantity}' is a vector; plot one component or an expression"
        )
    return arrays[0]


def spatial_dims(data: xr.DataArray | xr.Dataset) -> list[str]:
    return [str(dim) for dim in data.dims if dim != TIME_DIM]


def quantity_dims(quantity: str, dataset: xr.Dataset) -> list[str]:
    """Spatial dims of a quantity, found cheaply on a tiny cut of the data."""
    tiny = dataset.isel({dim: slice(0, 2) for dim in dataset.dims})
    dims: list[str] = []
    for array in quantity_arrays([quantity], tiny):
        dims.extend(dim for dim in spatial_dims(array) if dim not in dims)
    return dims


def snapshot_at(dataset: xr.Dataset, time: float) -> tuple[xr.Dataset, float | None]:
    """The output nearest to `time` and its time (None for static data).

    Picking the time first means expressions are evaluated on one snapshot.
    """
    if TIME_DIM not in dataset.dims:
        return dataset, None
    snapshot = dataset.sel({TIME_DIM: time}, method="nearest")
    return snapshot, float(snapshot.coords[TIME_DIM].item())


def cut(
    data: xr.DataArray,
    keep: Sequence[str],
    slices: Mapping[str, float],
) -> tuple[xr.DataArray, dict[str, float]]:
    """Slice every spatial dim not in `keep` at the grid point nearest to
    `slices[dim]` (the middle of the dim when unspecified). Returns the cut
    and the coordinates actually used."""
    used: dict[str, float] = {}
    for dim in spatial_dims(data):
        if dim in keep:
            continue
        if dim in slices and dim in data.coords:
            data = data.sel({dim: float(slices[dim])}, method="nearest")
        else:
            data = data.isel({dim: data.sizes[dim] // 2})
        if dim in data.coords:
            used[dim] = float(data.coords[dim].item())
    return data, used


def cell_edges(centers: np.ndarray) -> np.ndarray:
    """Edges of cells around (sorted) cell centers: midpoints between centers,
    extended by half a cell at both ends."""
    c = np.asarray(centers, dtype=float)
    if c.size == 1:
        return np.array([c[0] - 0.5, c[0] + 0.5])
    mid = (c[1:] + c[:-1]) / 2
    return np.concatenate([[c[0] - (mid[0] - c[0])], mid, [c[-1] + (c[-1] - mid[-1])]])
