"""Where simulations come from: real Entity output (via nt2py) or demo data.

Every source offers the same interface, so the endpoints never care which
one they talk to.
"""

from typing import Any, Protocol

import numpy as np
import pandas as pd
import xarray as xr

DEMO_PREFIX = "demo:"


class SimulationSource(Protocol):
    id: str
    path: str

    @property
    def fields(self) -> xr.Dataset:
        """Fields with dims (t, *spatial); may be lazy (dask)."""
        ...

    @property
    def species(self) -> list[dict[str, Any]]:
        """[{index, label, mass}] for every particle species."""
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
        """Times of the particle outputs (empty without particles)."""
        ...

    def particles(self, time: float) -> pd.DataFrame:
        """Particles at the output nearest to `time` (columns sp, x, ux, …, w)."""
        ...

    def particle_time(self, time: float) -> float:
        """Time of the particle output nearest to `time`."""
        ...


def open_simulation(path: str, simulation_id: str | None = None) -> SimulationSource:
    """Open `path`: `demo:<name>` gives synthetic data, anything else is read
    as Entity output with nt2py. Raises on unreadable paths."""
    if path.startswith(DEMO_PREFIX):
        from fakeloader import FakeSimulation

        return FakeSimulation(path, simulation_id)
    from nt2loader import Nt2Simulation

    return Nt2Simulation(path, simulation_id)
