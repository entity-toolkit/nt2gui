"""Where simulations come from: real Entity output (via nt2py) or demo data.

Every source offers the same interface, so the endpoints never care which
one they talk to.
"""

from collections.abc import Sequence
from typing import Any, Protocol

import numpy as np
import pandas as pd
import xarray as xr

DEMO_PREFIX = "demo:"
# Timeline when a simulation has no outputs at all.
EMPTY_TIMELINE = {"current": 0.0, "min": 0.0, "max": 1.0, "step": 1.0}


class SimulationSource(Protocol):
    id: str
    path: str
    # The run's own name, the default display name (made unique by the workspace).
    name: str

    @property
    def fields(self) -> xr.Dataset:
        """Fields with dims (t, *spatial); may be lazy (dask)."""
        ...

    @property
    def species(self) -> list[dict[str, Any]]:
        """[{index, label, mass}] for every particle species."""
        ...

    @property
    def attrs(self) -> dict[str, Any]:
        """The run's parameters, flat with dotted keys (`grid.resolution`);
        values may be numpy scalars, arrays or bytes."""
        ...

    @property
    def timeline(self) -> dict[str, float]:
        """{current, min, max, step} spanning all outputs."""
        ...

    @property
    def spectra(self) -> xr.Dataset | None:
        """Particle energy spectra with dims (t, E), if the output has them."""
        ...

    @property
    def particle_times(self) -> np.ndarray:
        """Ascending times of the particle outputs (empty without particles)."""
        ...

    @property
    def particle_columns(self) -> list[str]:
        """Per-particle quantities available (x, ux, …, w), without reading data."""
        ...

    def particles(
        self, time: float, columns: Sequence[str] | None = None
    ) -> pd.DataFrame:
        """Particles at the output nearest to `time`: the species index `sp`
        plus `columns` (all of `particle_columns` when None). Only the asked-for
        columns are read."""
        ...

    def species_counts(self, time: float) -> dict[int, int]:
        """Number of particles of each species at the output nearest to `time`."""
        ...

    def particle_time(self, time: float) -> float:
        """Time of the particle output nearest to `time`."""
        ...


def nearest_index(times: np.ndarray, time: float) -> int:
    return int(np.abs(np.asarray(times, dtype=float) - time).argmin())


def combined_timeline(*time_arrays: Any) -> dict[str, float]:
    """One timeline spanning every output (fields and particles may be
    written at different times); the step is the finest spacing."""
    times = np.unique(
        np.concatenate([np.asarray(t, float) for t in time_arrays] or [np.empty(0)])
    )
    if times.size == 0:
        return dict(EMPTY_TIMELINE)
    gaps = np.diff(times)
    gaps = gaps[gaps > 0]
    return {
        "current": float(times[0]),
        "min": float(times[0]),
        "max": float(times[-1]),
        "step": float(gaps.min()) if gaps.size else 1.0,
    }


def spanning_timeline(timelines: list[dict[str, float]]) -> dict[str, float]:
    """One timeline covering several simulations' (assumed in the same time
    units): from the earliest start to the latest end, stepping by the finest
    step. It starts at the first timeline's current time."""
    if not timelines:
        return dict(EMPTY_TIMELINE)
    return {
        "current": timelines[0]["current"],
        "min": min(timeline["min"] for timeline in timelines),
        "max": max(timeline["max"] for timeline in timelines),
        "step": min(timeline["step"] for timeline in timelines),
    }


def output_times(simulation: SimulationSource) -> np.ndarray:
    """Every output time (fields and particles), ascending, without repeats."""
    arrays = [np.asarray(simulation.particle_times, dtype=float)]
    if "t" in simulation.fields.coords:
        arrays.append(np.asarray(simulation.fields.coords["t"].values, dtype=float))
    return np.unique(np.concatenate(arrays))


def first_particle_time(simulation: SimulationSource) -> float:
    return float(simulation.particle_times[0])


def open_simulation(path: str, simulation_id: str | None = None) -> SimulationSource:
    """Open `path`: `demo:<name>` gives synthetic data, anything else is read
    as Entity output with nt2py. Raises on unreadable paths."""
    if path.startswith(DEMO_PREFIX):
        from .demo import DemoSimulation

        return DemoSimulation(path, simulation_id)
    from .nt2 import Nt2Simulation

    return Nt2Simulation(path, simulation_id)
