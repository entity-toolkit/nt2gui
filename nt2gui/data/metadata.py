"""What a simulation contains: field and particle metadata for the plot
controls, and a human-oriented summary for the sidebar."""

from typing import Any

import numpy as np
import xarray as xr

from ..sources import SimulationSource, first_particles
from .arrays import finite_list
from .particles import (
    SKIPPED_COLUMNS,
    SPECIES_COLUMN,
    builtin_quantities,
    default_scale,
    particle_dataset,
)
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
            dim: finite_list(dataset.coords[dim].values)
            for dim in sorted(used_dims)
            if dim in dataset.coords
        },
    }


def particle_metadata(simulation: SimulationSource) -> dict[str, Any]:
    """Species and the quantities offered by name (with their default scale)."""
    if not simulation.species:
        return {"species": [], "quantities": []}
    quantities = builtin_quantities(particle_dataset(first_particles(simulation)))
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
    frame = first_particles(simulation)
    counts = frame[SPECIES_COLUMN].value_counts().to_dict()
    return {
        "species": [
            {**species, "count": int(counts.get(species["index"], 0))}
            for species in simulation.species
        ],
        "countsAt": float(simulation.particle_times[0]),
        "quantities": [
            c for c in frame.columns if c != SPECIES_COLUMN and c not in SKIPPED_COLUMNS
        ],
        "times": describe_times(simulation.particle_times),
    }


def summarize(simulation: SimulationSource) -> dict[str, Any]:
    spectra = simulation.spectra
    return {
        "fields": describe_grid(simulation.fields),
        "particles": describe_particles(simulation),
        "spectra": describe_grid(spectra) if spectra is not None else None,
    }
