"""Smoothing fields over a window given in coordinate units (a boxcar)."""

from collections.abc import Mapping

import numpy as np
import xarray as xr

from .arrays import boxcar


def half_width(coordinates: np.ndarray, window: float) -> int:
    """Cells on each side of a boxcar `window` (coordinate units) wide: the
    window spans 2·h + 1 cells of the grid's typical (median) spacing."""
    values = np.asarray(coordinates, dtype=float)
    if values.size < 2 or not window > 0:
        return 0
    spacing = float(np.median(np.abs(np.diff(values))))
    if not spacing > 0:
        return 0
    # Half-cells round up (a window of 2 cells averages 3).
    return max(int(np.floor((window / spacing - 1) / 2 + 0.5)), 0)


def smooth(
    data: xr.DataArray, windows: Mapping[str, float]
) -> tuple[xr.DataArray, dict[str, int]]:
    """`data` averaged over `windows[dim]` along each of its dims that has a
    window; returns it and the window used per dim, in cells (only dims that
    were smoothed)."""
    values = None
    used: dict[str, int] = {}
    for dim, window in windows.items():
        if dim not in data.dims or dim not in data.coords:
            continue
        half = half_width(data.coords[dim].values, window)
        if half == 0:
            continue
        values = boxcar(
            data.values if values is None else values, data.dims.index(dim), half
        )
        used[dim] = 2 * half + 1
    if values is None:
        return data, used
    return data.copy(data=values), used
