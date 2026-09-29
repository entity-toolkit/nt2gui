"""Human-oriented overview of what a simulation contains (for the sidebar)."""

from typing import Any

import numpy as np
import xarray as xr

from .sources import SimulationSource

TIME_DIM = "t"


def describe_times(times: Any) -> dict[str, Any] | None:
    values = np.asarray(times, dtype=float)
    if values.size == 0:
        return None
    return {"count": int(values.size), "min": float(values.min()), "max": float(values.max())}


def describe_grid(dataset: xr.Dataset) -> dict[str, Any] | None:
    """Axes (size and range), quantities and output times of a gridded
    dataset such as fields (t, y, x) or spectra (t, E)."""
    if not dataset.data_vars:
        return None
    dims = [str(d) for d in dataset.dims if d != TIME_DIM]
    axes = []
    for dim in dims:
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
    times = simulation.particle_times
    first = float(np.min(times)) if len(times) else 0.0
    frame = simulation.particles(first)
    counts = frame["sp"].value_counts().to_dict() if "sp" in frame else {}
    return {
        "species": [
            {**species, "count": int(counts.get(species["index"], 0))}
            for species in simulation.species
        ],
        "countsAt": simulation.particle_time(first),
        # Species index and particle ids are bookkeeping, not quantities.
        "quantities": [c for c in frame.columns if c not in ("sp", "id")],
        "times": describe_times(times),
    }


def summarize(simulation: SimulationSource) -> dict[str, Any]:
    spectra = simulation.spectra
    return {
        "fields": describe_grid(simulation.fields),
        "particles": describe_particles(simulation),
        "spectra": describe_grid(spectra) if spectra is not None else None,
    }
