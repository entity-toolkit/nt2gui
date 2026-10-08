"""1D weighted particle histograms (e.g. energy spectra)."""

from collections.abc import Mapping
from typing import Any

import xarray as xr

from ..data.expressions import Variables
from ..data.particles import histogram_1d, species_mask
from ..data.regions import regions_mask, resolve_regions
from ..session.schema import ParticleHistogramConfig, Region


def render_particle_histogram(
    particles: xr.Dataset,
    config: ParticleHistogramConfig,
    regions: Mapping[str, Region],
    variables: Variables | None = None,
) -> dict[str, Any]:
    """One line per series (its species, inside any of its regions), all
    sharing the binned x axis."""
    selections = [
        species_mask(particles, series.species)
        & regions_mask(particles, resolve_regions(series.regions, regions))
        for series in config.series
    ]
    histogram = histogram_1d(particles, config.x, selections, variables)
    for line, series in zip(histogram["series"], config.series):
        line["species"] = series.species
    return histogram
