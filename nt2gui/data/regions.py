"""Saved spatial regions: which particles lie inside them."""

from collections.abc import Iterable, Mapping, Sequence

import numpy as np
import xarray as xr
from matplotlib.path import Path

from ..errors import UserError
from ..session.schema import Region
from .particles import PARTICLE_DIM


def resolve_regions(
    names: Iterable[str], available: Mapping[str, Region]
) -> list[Region]:
    """The regions called `names`, in order, without repeats."""
    regions: list[Region] = []
    for name in dict.fromkeys(names):
        if name not in available:
            raise UserError(f"Unknown region '{name}'")
        regions.append(available[name])
    return regions


def region_coordinates(regions: Iterable[Region]) -> list[str]:
    """The particle columns needed to test membership of `regions`."""
    names: dict[str, None] = {}
    for region in regions:
        names.update(dict.fromkeys(region.ranges))
        if region.polygon:
            names.update(dict.fromkeys((region.polygon.x, region.polygon.y)))
    return list(names)


def _coordinate(ds: xr.Dataset, name: str, region: Region) -> np.ndarray:
    if name not in ds:
        raise UserError(
            f"Region '{region.name}' needs the particles' '{name}' coordinate, "
            "which this simulation doesn't have"
        )
    return np.asarray(ds[name].values, dtype=np.float64)


def region_mask(ds: xr.Dataset, region: Region) -> np.ndarray:
    """Particles inside every constraint of `region` (bounds inclusive)."""
    mask = np.ones(ds.sizes.get(PARTICLE_DIM, 0), bool)
    for name, bounds in region.ranges.items():
        values = _coordinate(ds, name, region)
        mask &= (values >= bounds.min) & (values <= bounds.max)
    if region.polygon:
        polygon = region.polygon
        x = _coordinate(ds, polygon.x, region)
        y = _coordinate(ds, polygon.y, region)
        points = np.asarray(polygon.points, dtype=np.float64)
        # Only particles in the bounding box need the (slower) polygon test.
        (x_lo, y_lo), (x_hi, y_hi) = points.min(axis=0), points.max(axis=0)
        candidates = np.flatnonzero(
            mask & (x >= x_lo) & (x <= x_hi) & (y >= y_lo) & (y <= y_hi)
        )
        mask[:] = False
        if candidates.size:
            inside = Path(points).contains_points(
                np.column_stack((x[candidates], y[candidates]))
            )
            mask[candidates[inside]] = True
    return mask


def regions_mask(ds: xr.Dataset, regions: Sequence[Region]) -> np.ndarray:
    """Particles inside any of `regions`; every particle when there are none."""
    if not regions:
        return np.ones(ds.sizes.get(PARTICLE_DIM, 0), bool)
    return np.logical_or.reduce([region_mask(ds, region) for region in regions])
