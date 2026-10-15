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

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from ..errors import UserError
from ..session.schema import MAX_PARTICLE_BINS, ParticleAxis, ScaleKind
from .expressions import Variables, evaluate, expanded_names

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
    velocity = derived_velocity(map(str, ds.data_vars))
    if velocity:
        u_squared = sum(ds[c] ** 2 for c in velocity)
        ds["gamma"] = np.sqrt(1 + u_squared)
        ds["energy"] = np.sqrt(u_squared)
    return ds


def builtin_quantities(columns: Iterable[str]) -> list[str]:
    """Quantities offered by name, in display order, for the given columns."""
    available = set(columns)
    derived = DERIVED if derived_velocity(available) else ()
    order = (*POSITION_COLUMNS, *VELOCITY_COLUMNS, *derived, WEIGHT_COLUMN)
    return [name for name in order if name in available or name in derived]


def derived_velocity(columns: Iterable[str]) -> tuple[str, ...] | None:
    """The velocity components gamma/energy are computed from, if present."""
    available = set(columns)
    return next((v for v in VELOCITY_SETS if set(v) <= available), None)


def required_columns(
    quantities: Iterable[str],
    columns: Sequence[str],
    variables: Variables | None = None,
    derived: Mapping[str, str] | None = None,
) -> list[str]:
    """The columns needed to compute `quantities` (columns, gamma/energy,
    columns `derived` from another (name -> source, e.g. transformed `xp` from
    `x`), or expressions over them, possibly through named variables) and
    weight the result: what a plot must load."""
    available = set(columns)
    derived = derived or {}
    needed: list[str] = []

    def need(name: str) -> None:
        if name in derived:
            need(derived[name])
        elif name in available and name not in needed:
            needed.append(name)
        elif name in DERIVED:
            for component in derived_velocity(available) or ():
                need(component)

    def known(name: str) -> bool:
        return name in available or name in DERIVED or name in derived

    for quantity in quantities:
        if known(quantity):
            need(quantity)
            continue
        for name in sorted(expanded_names(quantity, variables or {}, known)):
            need(name)
    need(WEIGHT_COLUMN)
    return needed


def sample_dataset(columns: Sequence[str], size: int = 16) -> xr.Dataset:
    """A small all-zero particle dataset with the given columns, for checking
    that an expression is valid without reading any data."""
    frame = pd.DataFrame({column: np.zeros(size) for column in columns})
    frame[SPECIES_COLUMN] = np.zeros(size, dtype=np.int32)
    return particle_dataset(frame)


def default_scale(quantity: str) -> ScaleKind:
    return "log" if quantity in DERIVED else "linear"


def quantity_values(
    quantity: str, ds: xr.Dataset, variables: Variables | None = None
) -> np.ndarray:
    """Per-particle values of a column, derived quantity, named variable, or
    expression."""
    array = ds[quantity] if quantity in ds else evaluate(quantity, ds, variables)
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
    ds: xr.Dataset,
    axis: ParticleAxis,
    selections: Sequence[np.ndarray],
    variables: Variables | None = None,
) -> dict[str, Any]:
    """Weighted counts along `axis` for each particle selection (boolean
    masks, e.g. species and regions), all on the same bins (the range covers
    every selection). Edges are in data units."""
    if not selections:
        raise UserError("Add at least one line to plot")
    weights = ds[WEIGHT_COLUMN].values
    scaled = to_scaled(
        quantity_values(axis.quantity, ds, variables), axis.scale, axis.power
    )
    in_any = np.logical_or.reduce(selections)
    edges = bin_edges(
        scaled[in_any], axis.bins, axis.scale, axis.power, axis.min, axis.max
    )

    lines = []
    for mask in selections:
        valid = mask & np.isfinite(scaled)
        counts, _ = np.histogram(scaled[valid], bins=edges, weights=weights[valid])
        lines.append(
            {
                "counts": counts.tolist(),
                "excludedWeight": float(weights[mask & ~valid].sum()),
            }
        )
    return {
        "edges": from_scaled(edges, axis.scale, axis.power).tolist(),
        "series": lines,
    }


def histogram_2d(
    ds: xr.Dataset,
    x: ParticleAxis,
    y: ParticleAxis,
    mask: np.ndarray,
    variables: Variables | None = None,
) -> dict[str, Any]:
    """Weighted 2D histogram of the selected particles (a boolean mask);
    counts are indexed [y, x] and edges are in data units."""
    weights = ds[WEIGHT_COLUMN].values
    x_scaled = to_scaled(quantity_values(x.quantity, ds, variables), x.scale, x.power)
    y_scaled = to_scaled(quantity_values(y.quantity, ds, variables), y.scale, y.power)
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
