"""What a simulation contains: field and particle metadata for the plot
controls, and a human-oriented summary for the sidebar."""

from typing import Any

import numpy as np
import xarray as xr

from ..sources import SimulationSource, first_particle_time
from .arrays import even_sample, finite_list

# Coordinate values sent per dim: they only feed the slice sliders (which
# can't have more steps than pixels); the server snaps to the nearest cell.
MAX_COORDINATE_VALUES = 2049
from .particles import builtin_quantities, default_scale
from .quantities import TIME_DIM, spatial_dims, vector_groups


def field_metadata(dataset: xr.Dataset) -> dict[str, Any]:
    """Fields with their spatial dims, vector groups, and coordinate values."""
    fields = [
        {"name": str(name), "dims": spatial_dims(dataset[name])}
        for name in sorted(map(str, dataset.data_vars))
    ]
    used_dims = {dim for field in fields for dim in field["dims"]}
    return {
        "fields": fields,
        "vectors": [
            {"name": name, "components": components}
            for name, components in vector_groups(f["name"] for f in fields).items()
        ],
        "coords": {
            dim: finite_list(
                even_sample(dataset.coords[dim].values, MAX_COORDINATE_VALUES)
            )
            for dim in sorted(used_dims)
            if dim in dataset.coords
        },
    }


def particle_metadata(simulation: SimulationSource) -> dict[str, Any]:
    """Species and the quantities offered by name (with their default scale)."""
    if not simulation.species:
        return {"species": [], "quantities": []}
    quantities = builtin_quantities(simulation.particle_columns)
    return {
        "species": simulation.species,
        "quantities": [
            {"name": name, "defaultScale": default_scale(name)} for name in quantities
        ],
    }


def describe_times(times: Any) -> dict[str, Any] | None:
    values = np.asarray(times, dtype=float)
    if values.size == 0:
        return None
    return {
        "count": int(values.size),
        "min": float(values.min()),
        "max": float(values.max()),
    }


def describe_grid(dataset: xr.Dataset) -> dict[str, Any] | None:
    """Axes (size and range), quantities and output times of a gridded
    dataset such as fields (t, y, x) or spectra (t, E)."""
    if not dataset.data_vars:
        return None
    axes = []
    for dim in spatial_dims(dataset):
        entry: dict[str, Any] = {"name": dim, "size": int(dataset.sizes[dim])}
        if dim in dataset.coords and dataset.sizes[dim] > 0:
            values = np.asarray(dataset.coords[dim].values, dtype=float)
            entry |= {"min": float(values.min()), "max": float(values.max())}
        axes.append(entry)
    times = dataset.coords[TIME_DIM].values if TIME_DIM in dataset.coords else []
    return {
        "axes": axes,
        "quantities": sorted(map(str, dataset.data_vars)),
        "times": describe_times(times),
    }


def describe_particles(simulation: SimulationSource) -> dict[str, Any] | None:
    if not simulation.species:
        return None
    first = first_particle_time(simulation)
    counts = simulation.species_counts(first)
    return {
        "species": [
            {**species, "count": counts.get(species["index"], 0)}
            for species in simulation.species
        ],
        "countsAt": simulation.particle_time(first),
        "quantities": simulation.particle_columns,
        "times": describe_times(simulation.particle_times),
    }


def summarize(simulation: SimulationSource) -> dict[str, Any]:
    spectra = simulation.spectra
    return {
        "fields": describe_grid(simulation.fields),
        "particles": describe_particles(simulation),
        "spectra": describe_grid(spectra) if spectra is not None else None,
    }


# Longer array attributes are cut (they are parameters, not data).
MAX_ATTRIBUTE_ITEMS = 256


def attribute_value(value: Any) -> Any:
    """An attribute as JSON: bytes as (trimmed) text, numpy scalars as
    numbers (float32 by its shortest repr, so 0.1 stays 0.1), arrays as
    lists; anything else unknown as its text."""
    if isinstance(value, (bytes, np.bytes_)):
        return bytes(value).decode("utf-8", errors="replace").strip()
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(str(value)) if isinstance(value, np.float32) else float(value)
        return number if np.isfinite(number) else str(number)
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, np.ndarray):
        flat = value.ravel()
        return [attribute_value(item) for item in flat[:MAX_ATTRIBUTE_ITEMS]]
    if isinstance(value, (list, tuple)):
        return [attribute_value(item) for item in value[:MAX_ATTRIBUTE_ITEMS]]
    return str(value)


def simulation_attributes(simulation: SimulationSource) -> dict[str, Any]:
    """The run's parameters (`<block>.<subblock>.<name>` keys), sorted."""
    return {
        str(key): attribute_value(value)
        for key, value in sorted(simulation.attrs.items(), key=lambda kv: str(kv[0]))
    }
