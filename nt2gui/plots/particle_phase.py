"""2D weighted particle histograms (phase-space plots), shaded on the server."""

from collections.abc import Mapping
from typing import Any

import numpy as np
import xarray as xr

from ..data.particles import histogram_2d, species_mask
from ..data.regions import regions_mask, resolve_regions
from ..render import shade
from ..session.schema import ParticlePhaseConfig, Region


def render_particle_phase(
    particles: xr.Dataset,
    config: ParticlePhaseConfig,
    regions: Mapping[str, Region],
) -> dict[str, Any]:
    """Bins the selected species (inside any of the chosen regions) uniformly
    in each axis' scaled space; empty bins are transparent.

    On a linear color scale the minimum defaults to 0 (no particles), not to
    the smallest non-empty bin.
    """
    mask = species_mask(particles, config.species) & regions_mask(
        particles, resolve_regions(config.regions, regions)
    )
    histogram = histogram_2d(particles, config.x, config.y, mask)
    counts = np.where(histogram["counts"] > 0, histogram["counts"], np.nan)
    vmin = config.vmin
    if vmin is None and config.color_scale == "linear":
        vmin = 0.0
    image = shade(counts, config.color_map, config.color_scale, vmin, config.vmax)
    x_edges, y_edges = histogram["edges"]
    return {
        **image,
        "extent": {
            "xMin": float(x_edges[0]),
            "xMax": float(x_edges[-1]),
            "yMin": float(y_edges[0]),
            "yMax": float(y_edges[-1]),
        },
        "excludedWeight": histogram["excludedWeight"],
    }
