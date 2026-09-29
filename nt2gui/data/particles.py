"""Weighted particle histograms (1D spectra and 2D phase-space plots).

Particles at one time are a table with columns `sp` (species index), `x`
(and optionally `y`, `z`), `ux`, `uy`, `uz` (the spatial part of the
four-velocity) and `w` (weight), as produced by nt2py. They are turned into an
xarray Dataset along a `particle` dimension, with two derived quantities:

- `gamma = sqrt(1 + ux**2 + uy**2 + uz**2)` (Lorentz factor, massive species)
- `energy = sqrt(ux**2 + uy**2 + uz**2)` (energy of massless species)

so custom quantities are expressions evaluated by `expressions.py`. Plot
responses are built in `nt2gui.plots.particle_histogram` / `particle_phase`.

Every axis is binned uniformly in a scaled space:

- `linear`: A
- `log`: log10(A); particles with A <= 0 are left out
- `power`: sign(A) * |A|**p, a symlog-like stretch for signed data

Bin edges are reported back in data units, so the client can label axes with
real values.
"""

from collections.abc import Sequence
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from ..errors import UserError
from ..session.schema import MAX_PARTICLE_BINS, ParticleAxis, ScaleKind
from .expressions import evaluate

PARTICLE_DIM = "particle"
# Cartesian and spherical runs name their columns differently.
POSITION_COLUMNS = ("x", "y", "z", "r", "th", "ph")
VELOCITY_SETS = (("ux", "uy", "uz"), ("ur", "uth", "uph"))
VELOCITY_COLUMNS = tuple(c for columns in VELOCITY_SETS for c in columns)
# Particle ids are bookkeeping, not quantities.
SKIPPED_COLUMNS = ("id",)
WEIGHT_COLUMN = "w"
SPECIES_COLUMN = "sp"
DERIVED = ("gamma", "energy")


def particle_dataset(frame: pd.DataFrame) -> xr.Dataset:
    """Columns as variables along `particle`, plus gamma and energy."""
    data = {
        column: (PARTICLE_DIM, frame[column].to_numpy(dtype=np.float64))
        for column in frame.columns
        if column != SPECIES_COLUMN and column not in SKIPPED_COLUMNS
    }
    data[SPECIES_COLUMN] = (PARTICLE_DIM, frame[SPECIES_COLUMN].to_numpy())
    if WEIGHT_COLUMN not in data:
        data[WEIGHT_COLUMN] = (PARTICLE_DIM, np.ones(len(frame)))
    ds = xr.Dataset(data)
    for velocity in VELOCITY_SETS:
        if all(c in ds for c in velocity):
            u_squared = sum(ds[c] ** 2 for c in velocity)
            ds["gamma"] = np.sqrt(1 + u_squared)
            ds["energy"] = np.sqrt(u_squared)
            break
    return ds


def builtin_quantities(ds: xr.Dataset) -> list[str]:
    """Quantities offered by name, in display order."""
    order = (*POSITION_COLUMNS, *VELOCITY_COLUMNS, *DERIVED, WEIGHT_COLUMN)
    return [name for name in order if name in ds]


def default_scale(quantity: str) -> ScaleKind:
    return "log" if quantity in DERIVED else "linear"


def quantity_values(quantity: str, ds: xr.Dataset) -> np.ndarray:
    """Per-particle values of a column, derived quantity, or expression."""
    array = ds[quantity] if quantity in ds else evaluate(quantity, ds)
    if array.dims != (PARTICLE_DIM,):
        raise UserError(f"'{quantity}' must give one value per particle")
    return np.asarray(array.values, dtype=np.float64)


# --- scales -----------------------------------------------------------------


def to_scaled(values: np.ndarray, kind: ScaleKind, power: float = 0.5) -> np.ndarray:
    """Map data to the space bins are uniform in; invalid values become NaN."""
    with np.errstate(all="ignore"):
        if kind == "linear":
            return values.astype(np.float64)
        if kind == "log":
            return np.where(values > 0, np.log10(values), np.nan)
        if kind == "power":
            _check_power(power)
            return np.sign(values) * np.abs(values) ** power
    raise UserError(f"Unknown scale '{kind}'")


def from_scaled(values: np.ndarray, kind: ScaleKind, power: float = 0.5) -> np.ndarray:
    if kind == "linear":
        return values.astype(np.float64)
    if kind == "log":
        return 10.0**values
    if kind == "power":
        _check_power(power)
        return np.sign(values) * np.abs(values) ** (1 / power)
    raise UserError(f"Unknown scale '{kind}'")


def _check_power(power: float) -> None:
    if not (np.isfinite(power) and power > 0):
        raise UserError("The power-scale exponent p must be positive")


def bin_edges(
    scaled: np.ndarray,
    bins: int,
    kind: ScaleKind,
    power: float,
    lower: float | None = None,
    upper: float | None = None,
) -> np.ndarray:
    """`bins + 1` edges uniform in scaled space, spanning [lower, upper] (data
    units) where given and the finite data elsewhere."""
    if not 1 <= bins <= MAX_PARTICLE_BINS:
        raise UserError(f"Number of bins must be between 1 and {MAX_PARTICLE_BINS}")
    finite = scaled[np.isfinite(scaled)]
    limits = []
    for limit, fallback in ((lower, np.min), (upper, np.max)):
        if limit is not None:
            (value,) = to_scaled(np.array([limit], dtype=float), kind, power)
            if not np.isfinite(value):
                raise UserError(f"Range limit {limit} is invalid for a {kind} scale")
            limits.append(float(value))
        else:
            limits.append(float(fallback(finite)) if finite.size else 0.0)
    lo, hi = limits
    if lo > hi:
        raise UserError("Range minimum must be below the maximum")
    if lo == hi:
        # A single value still gets a visible bin around it.
        pad = 0.5 if kind == "log" or lo == 0 else abs(lo) * 0.1
        lo, hi = lo - pad, hi + pad
    return np.linspace(lo, hi, bins + 1)


# --- histograms ---------------------------------------------------------------


def species_mask(ds: xr.Dataset, species: Sequence[int]) -> np.ndarray:
    """Particles of the given species; an empty list means every species."""
    sp = ds[SPECIES_COLUMN].values
    return np.ones(sp.shape, bool) if not species else np.isin(sp, list(species))


def histogram_1d(
    ds: xr.Dataset, axis: ParticleAxis, series: Sequence[Sequence[int]]
) -> dict[str, Any]:
    """Weighted counts along `axis` for each species selection in `series`,
    all on the same bins (the range covers every series). Edges are in data
    units."""
    if not series:
        raise UserError("Add at least one line to plot")
    weights = ds[WEIGHT_COLUMN].values
    masks = [species_mask(ds, species) for species in series]
    scaled = to_scaled(quantity_values(axis.quantity, ds), axis.scale, axis.power)
    in_any = np.logical_or.reduce(masks)
    edges = bin_edges(
        scaled[in_any], axis.bins, axis.scale, axis.power, axis.min, axis.max
    )

    lines = []
    for species, mask in zip(series, masks):
        valid = mask & np.isfinite(scaled)
        counts, _ = np.histogram(scaled[valid], bins=edges, weights=weights[valid])
        lines.append(
            {
                "species": list(species),
                "counts": counts.tolist(),
                "excludedWeight": float(weights[mask & ~valid].sum()),
            }
        )
    return {
        "edges": from_scaled(edges, axis.scale, axis.power).tolist(),
        "series": lines,
    }


def histogram_2d(
    ds: xr.Dataset, x: ParticleAxis, y: ParticleAxis, species: Sequence[int]
) -> dict[str, Any]:
    """Weighted 2D histogram of the selected species; counts are indexed
    [y, x] and edges are in data units."""
    mask = species_mask(ds, species)
    weights = ds[WEIGHT_COLUMN].values
    x_scaled = to_scaled(quantity_values(x.quantity, ds), x.scale, x.power)
    y_scaled = to_scaled(quantity_values(y.quantity, ds), y.scale, y.power)
    valid = mask & np.isfinite(x_scaled) & np.isfinite(y_scaled)
    edges = [
        bin_edges(values[valid], axis.bins, axis.scale, axis.power, axis.min, axis.max)
        for axis, values in ((x, x_scaled), (y, y_scaled))
    ]
    counts, _, _ = np.histogram2d(
        x_scaled[valid], y_scaled[valid], bins=edges, weights=weights[valid]
    )
    return {
        "counts": counts.T,
        "edges": [from_scaled(e, a.scale, a.power) for e, a in zip(edges, (x, y))],
        "excludedWeight": float(weights[mask & ~valid].sum()),
    }
