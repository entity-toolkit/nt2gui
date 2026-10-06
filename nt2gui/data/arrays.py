"""Array helpers for JSON responses."""

import numpy as np

# float32 precision (what Entity writes); more digits only make JSON bigger.
SIGNIFICANT_DIGITS = 7


def finite_list(values: object, digits: int | None = SIGNIFICANT_DIGITS) -> list[float | None]:
    """Floats for JSON, rounded to `digits` significant digits (None: exact),
    with NaN/inf (not valid JSON) as null."""
    array = np.asarray(values, dtype=float).ravel()
    if digits is None:
        return [float(v) if np.isfinite(v) else None for v in array]
    return [float(f"{v:.{digits}g}") if np.isfinite(v) else None for v in array]


def even_sample(values: np.ndarray, max_points: int) -> np.ndarray:
    """At most `max_points` evenly spaced elements, always including the
    first and last."""
    if len(values) <= max_points:
        return values
    indices = np.unique(np.linspace(0, len(values) - 1, max_points).round().astype(int))
    return values[indices]


def minmax_indices(lines: list[np.ndarray], max_points: int) -> np.ndarray:
    """Indices that keep the shape of `lines` (same length, plotted together)
    with at most about `max_points` points: the range is split into buckets
    and, for every line, each bucket's minimum and maximum are kept, so peaks
    survive. The first and last index are always kept.
    """
    length = len(lines[0]) if lines else 0
    if length <= max_points or not lines:
        return np.arange(length)

    # Each bucket keeps up to 2 points per line.
    buckets = max(1, (max_points - 2) // (2 * len(lines)))
    size = -(-length // buckets)  # ceil
    padded = buckets * size
    keep = [np.array([0, length - 1])]
    starts = np.arange(buckets) * size
    for line in lines:
        grid = np.full(padded, np.nan)
        grid[:length] = line
        grid = grid.reshape(buckets, size)
        finite = np.isfinite(grid)
        any_finite = finite.any(axis=1)
        # nanargmin/nanargmax fail on all-NaN buckets: point those at index 0.
        lows = np.where(any_finite, np.argmin(np.where(finite, grid, np.inf), axis=1), 0)
        highs = np.where(any_finite, np.argmax(np.where(finite, grid, -np.inf), axis=1), 0)
        keep += [starts + lows, starts + highs]
    indices = np.unique(np.concatenate(keep))
    return indices[indices < length]


def block_factor(size: int, max_size: int) -> int:
    """The smallest block size that brings `size` cells down to at most
    `max_size` blocks (1: keep every cell)."""
    return max(1, -(-size // max_size))


def block_mean(values: np.ndarray, factors: tuple[int, int]) -> np.ndarray:
    """Averages a 2D array over blocks of `factors` (rows, columns) cells,
    ignoring NaNs. Blocks at the far ends may be partial (they average what
    is there); an all-NaN block stays NaN."""
    data = np.asarray(values, dtype=float)
    fy, fx = factors
    if fy == 1 and fx == 1:
        return data
    ny, nx = data.shape
    shape = (-(-ny // fy), -(-nx // fx))
    has_nan = bool(np.isnan(data).any())
    clean = np.where(np.isnan(data), 0.0, data) if has_nan else data
    sums = np.zeros(shape)
    counts = np.zeros(shape) if has_nan else None
    # One strided view per offset within a block: much faster than reducing
    # a reshaped (blocks, factor) array.
    for i in range(fy):
        for j in range(fx):
            part = clean[i::fy, j::fx]
            sums[: part.shape[0], : part.shape[1]] += part
            if counts is not None:
                finite = ~np.isnan(data[i::fy, j::fx])
                counts[: part.shape[0], : part.shape[1]] += finite
    if counts is None:
        # Cells per block: full blocks, except the last row/column of blocks.
        rows = np.minimum(fy, ny - fy * np.arange(shape[0]))
        cols = np.minimum(fx, nx - fx * np.arange(shape[1]))
        counts = np.outer(rows, cols)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(counts > 0, sums / counts, np.nan)
