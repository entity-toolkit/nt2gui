"""Server-side shading of 2D field slices (pseudocolor plots)."""

import base64
from io import BytesIO

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import xarray as xr
from matplotlib.colors import LogNorm, Normalize, to_hex

from fields import quantity_arrays


def color_norm(
    values: np.ndarray,
    scale: str,
    vmin: float | None,
    vmax: float | None,
) -> Normalize:
    """Color normalization; unset limits follow the finite (for log: positive)
    data."""
    data = np.asarray(values, dtype=float)
    if scale == "linear":
        return Normalize(vmin=vmin, vmax=vmax)
    if scale != "log":
        raise ValueError(f"Unknown color scale '{scale}'")
    positive = data[np.isfinite(data) & (data > 0)]
    if vmin is not None and vmin <= 0:
        raise ValueError("A log color scale needs a positive minimum")
    if vmin is None and vmax is None and positive.size == 0:
        raise ValueError("No positive values to show on a log color scale")
    if vmin is not None:
        lo = float(vmin)
    elif positive.size:
        lo = float(positive.min())
    else:
        lo = float(vmax) / 10  # vmax is set here (checked above)
    if vmax is not None:
        hi = float(vmax)
    elif positive.size:
        hi = float(positive.max())
    else:
        hi = lo * 10
    if hi <= lo:
        hi = lo * 10
    return LogNorm(vmin=lo, vmax=hi)


def log_ticks(vmin: float, vmax: float) -> list[float]:
    """Decades within [vmin, vmax]; with fewer than two, 1-2-5 steps instead."""
    low, high = np.floor(np.log10(vmin)), np.ceil(np.log10(vmax))
    for mantissas in ((1.0,), (1.0, 2.0, 5.0), tuple(range(1, 10))):
        ticks = [
            float(m * 10.0**exponent)
            for exponent in np.arange(low, high + 1)
            for m in mantissas
        ]
        inside = [t for t in ticks if vmin * (1 - 1e-9) <= t <= vmax * (1 + 1e-9)]
        if len(inside) >= 2:
            return inside
    return [float(vmin), float(vmax)]


def render_pseudocolor(
    fields: xr.Dataset, config: dict, time_value: float, viewport: dict | None = None
) -> dict:
    """Shade one field (or expression) at `time_value` as a PNG; axes and the
    colorbar are drawn by the client from the returned extent and ticks."""
    field = config.get("field")
    x_coordinate = config.get("xCoordinate", "x")
    y_coordinate = config.get("yCoordinate", "y")

    if not field:
        raise ValueError("Field name is required for pseudocolor rendering")

    # Pick the time first, so an expression is evaluated on one snapshot.
    if "t" in fields.dims:
        snapshot = fields.sel(t=time_value, method="nearest")
        actual_time = float(snapshot.coords["t"].item())
    else:
        snapshot, actual_time = fields, float(time_value)
    arrays = quantity_arrays([field], snapshot)
    if len(arrays) != 1:
        raise ValueError(
            f"'{field}' is a vector; plot one component or an expression"
        )
    slice_data = arrays[0]

    for coordinate in (x_coordinate, y_coordinate):
        if coordinate not in slice_data.dims:
            raise ValueError(f"'{field}' does not depend on '{coordinate}'")
    if x_coordinate == y_coordinate:
        raise ValueError("x and y must be different coordinates")
    # Fields with more than two spatial dims are cut at `slices[dim]` (the
    # nearest grid point) along every other dim, or through its middle.
    requested_slices = config.get("slices") or {}
    used_slices: dict[str, float] = {}
    for dim in list(slice_data.dims):
        if dim in (x_coordinate, y_coordinate):
            continue
        if dim in requested_slices:
            slice_data = slice_data.sel(
                {dim: float(requested_slices[dim])}, method="nearest"
            )
        else:
            slice_data = slice_data.isel({dim: slice_data.sizes[dim] // 2})
        used_slices[str(dim)] = float(slice_data.coords[dim].item())

    # imshow puts the first axis vertically: rows are y, columns x.
    ordered = slice_data.transpose(y_coordinate, x_coordinate)
    values = ordered.values

    x_vals = slice_data.coords[x_coordinate]
    y_vals = slice_data.coords[y_coordinate]

    requested_view = viewport or {}
    if requested_view:
        x_min = requested_view.get("xMin")
        x_max = requested_view.get("xMax")
        y_min = requested_view.get("yMin")
        y_max = requested_view.get("yMax")

        x_lower, x_upper = sorted(
            [
                float(x_min if x_min is not None else x_vals.min()),
                float(x_max if x_max is not None else x_vals.max()),
            ]
        )
        y_lower, y_upper = sorted(
            [
                float(y_min if y_min is not None else y_vals.min()),
                float(y_max if y_max is not None else y_vals.max()),
            ]
        )

        ordered = ordered.sel(
            {x_coordinate: slice(x_lower, x_upper), y_coordinate: slice(y_lower, y_upper)}
        )

        if ordered.sizes.get(x_coordinate, 0) == 0 or ordered.sizes.get(y_coordinate, 0) == 0:
            raise ValueError("Selected zoom window is empty")

        values = ordered.values
        x_vals = ordered.coords.get(x_coordinate, x_vals)
        y_vals = ordered.coords.get(y_coordinate, y_vals)

    fig, ax = plt.subplots(figsize=(5, 4), dpi=120)
    extent = (
        float(x_vals.min()),
        float(x_vals.max()),
        float(y_vals.min()),
        float(y_vals.max()),
    )
    color_scale = config.get("colorScale") or "linear"
    norm = color_norm(values, color_scale, config.get("vmin"), config.get("vmax"))
    if color_scale == "log":
        # Values <= 0 have no place on a log scale: leave them transparent.
        values = np.where(np.asarray(values) > 0, values, np.nan)
    cmap = plt.get_cmap(config.get("colorMap") or "viridis").with_extremes(
        bad=(0, 0, 0, 0)
    )
    im = ax.imshow(
        values,
        origin="lower",
        cmap=cmap,
        norm=norm,
        extent=extent,
        aspect="auto",
    )

    colorbar = fig.colorbar(im, ax=ax, label=field)
    fig.canvas.draw()

    x_ticks = [float(tick) for tick in ax.get_xticks()]
    y_ticks = [float(tick) for tick in ax.get_yticks()]

    x_ticklabels = [label.get_text() for label in ax.get_xticklabels()]
    y_ticklabels = [label.get_text() for label in ax.get_yticklabels()]

    def _filter_ticks(positions, labels, lower, upper):
        tolerance = abs(upper - lower) * 1e-9
        filtered_positions = []
        filtered_labels = []

        for position, label in zip(positions, labels):
            if lower - tolerance <= position <= upper + tolerance:
                filtered_positions.append(position)
                filtered_labels.append(label)

        return filtered_positions, filtered_labels

    x_ticks, x_ticklabels = _filter_ticks(
        x_ticks, x_ticklabels, extent[0], extent[1]
    )
    y_ticks, y_ticklabels = _filter_ticks(
        y_ticks, y_ticklabels, extent[2], extent[3]
    )

    vmin, vmax = im.get_clim()

    colorbar_ticks = [float(tick) for tick in colorbar.get_ticks()]
    if color_scale == "log":
        # Matplotlib's log labels are mathtext ("$\\mathdefault{10^{2}}$").
        colorbar_ticks = log_ticks(vmin, vmax)
        colorbar_ticklabels = [f"{tick:g}" for tick in colorbar_ticks]
    else:
        colorbar_ticklabels = [
            label.get_text() for label in colorbar.ax.get_yticklabels()
        ]
    colorbar_ticks, colorbar_ticklabels = _filter_ticks(
        colorbar_ticks, colorbar_ticklabels, vmin, vmax
    )

    colors = [to_hex(im.get_cmap()(i / 127)) for i in range(128)]

    colorbar.remove()
    ax.set_axis_off()
    ax.set_position((0, 0, 1, 1))

    fig.canvas.draw()
    image_width, image_height = fig.canvas.get_width_height()

    buffer = BytesIO()
    # Transparent, so masked cells show the panel behind them.
    fig.savefig(
        buffer, format="png", bbox_inches=None, pad_inches=0, transparent=True
    )
    plt.close(fig)
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("ascii")

    return {
        "image": encoded,
        "timestamp": actual_time,
        "slices": used_slices,
        "extent": {
            "xMin": extent[0],
            "xMax": extent[1],
            "yMin": extent[2],
            "yMax": extent[3],
        },
        "imageSize": {"width": image_width, "height": image_height},
        "xTicks": {"positions": x_ticks, "labels": x_ticklabels},
        "yTicks": {"positions": y_ticks, "labels": y_ticklabels},
        "colorbar": {
            "ticks": colorbar_ticks,
            "labels": colorbar_ticklabels,
            "vmin": float(vmin),
            "vmax": float(vmax),
            "scale": color_scale,
            "colors": colors,
        },
        "colorMap": im.get_cmap().name,
    }
