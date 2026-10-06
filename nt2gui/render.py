"""Shading value grids into images for the client.

Only the image is made on the server; axes and the colorbar are drawn by the
client (d3) from the returned extent and color limits. matplotlib is used for
its colormaps and normalizations only — no figures, so no pyplot state is
shared between the server's worker threads.
"""

import base64
from io import BytesIO
from typing import Any

import numpy as np
from matplotlib import colormaps
from matplotlib.colors import Colormap, LogNorm, Normalize, to_hex
from matplotlib.image import imsave

from .errors import UserError
from .session.schema import ColorScale

COLORBAR_SAMPLES = 128


def colormap(name: str) -> Colormap:
    """The named colormap, with missing values (NaN) transparent."""
    if name not in colormaps:
        raise UserError(f"Unknown colormap '{name}'")
    return colormaps[name].with_extremes(bad=(0, 0, 0, 0))


def color_limits(
    values: np.ndarray,
    scale: ColorScale,
    vmin: float | None,
    vmax: float | None,
) -> tuple[float, float]:
    """Color limits: `vmin`/`vmax` where given, else the finite (for log:
    positive) values. Constant data gets a non-empty range around it."""
    data = np.asarray(values, dtype=float)
    if scale == "log":
        if vmin is not None and vmin <= 0:
            raise UserError("A log color scale needs a positive minimum")
        shown = data[np.isfinite(data) & (data > 0)]
        if vmin is None and vmax is None and shown.size == 0:
            raise UserError("No positive values to show on a log color scale")
    elif scale == "linear":
        shown = data[np.isfinite(data)]
    else:
        raise UserError(f"Unknown color scale '{scale}'")

    def widen(lo: float) -> float:
        return lo * 10 if scale == "log" else lo + (abs(lo) or 1.0)

    if vmin is not None:
        lo = float(vmin)
    elif shown.size:
        lo = float(shown.min())
    else:
        assert vmax is not None  # no data and no vmin: only vmax can be set
        lo = vmax / 10 if scale == "log" else vmax - 1
    if vmax is not None:
        hi = float(vmax)
    elif shown.size:
        hi = float(shown.max())
    else:
        hi = widen(lo)
    return (lo, hi) if hi > lo else (lo, widen(lo))


def shade(
    values: np.ndarray,
    color_map: str,
    scale: ColorScale,
    vmin: float | None = None,
    vmax: float | None = None,
) -> dict[str, Any]:
    """PNG of `values` indexed [row, column] with row 0 at the bottom (y up).

    NaNs, and values <= 0 on a log scale, are transparent. Returns the image
    (base64), its pixel size, and the colorbar the client should draw.
    """
    data = np.asarray(values, dtype=float)
    lo, hi = color_limits(data, scale, vmin, vmax)
    norm = LogNorm(lo, hi) if scale == "log" else Normalize(lo, hi)
    if scale == "log":
        data = np.where(data > 0, data, np.nan)
    cmap = colormap(color_map)
    buffer = BytesIO()
    # imsave writes RGBA arrays directly (no figure, so thread-safe).
    imsave(buffer, cmap(norm(data)), format="png", origin="lower")
    return {
        "image": base64.b64encode(buffer.getvalue()).decode("ascii"),
        "imageSize": {"width": int(data.shape[1]), "height": int(data.shape[0])},
        "colorbar": {
            "vmin": lo,
            "vmax": hi,
            "scale": scale,
            "colors": [
                to_hex(cmap(i / (COLORBAR_SAMPLES - 1)))
                for i in range(COLORBAR_SAMPLES)
            ],
        },
    }
