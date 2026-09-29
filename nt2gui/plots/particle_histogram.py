"""1D weighted particle histograms (e.g. energy spectra)."""

from typing import Any

import xarray as xr

from ..data.particles import histogram_1d
from ..session.schema import ParticleHistogramConfig


def render_particle_histogram(
    particles: xr.Dataset, config: ParticleHistogramConfig
) -> dict[str, Any]:
    """One line per series, all sharing the binned x axis."""
    return histogram_1d(
        particles, config.x, [series.species for series in config.series]
    )
