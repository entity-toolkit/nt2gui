"""2D slices through fields (pseudocolor plots), shaded on the server."""

from typing import Any

import xarray as xr

from ..data.arrays import block_factor, block_mean
from ..data.expressions import Variables
from ..data.smoothing import smooth
from ..data.transforms import IDENTITY, Frame, base_of, on_axes
from ..data.quantities import (
    QuantityError,
    cell_edges,
    cut,
    single_quantity,
    snapshot_at,
)
from ..errors import UserError
from ..render import shade
from ..session.schema import PseudocolorConfig, ZoomWindow

# Images are sized for the screen, not the data: beyond this many cells along
# an axis, blocks of cells are averaged into one pixel. The zoom window is cut
# first, so zooming in brings back full resolution.
MAX_IMAGE_SIZE = 4096


def render_pseudocolor(
    fields: xr.Dataset,
    config: PseudocolorConfig,
    time: float,
    viewport: ZoomWindow | None = None,
    max_size: int = MAX_IMAGE_SIZE,
    variables: Variables | None = None,
    frame: Frame = IDENTITY,
) -> dict[str, Any]:
    """Shade one field (or expression) over (x, y) at `time`.

    Dims beyond x/y are cut at `config.slices` (the middle by default). With
    a `viewport`, only the cells inside it are shaded. More than `max_size`
    cells along an axis are averaged in blocks (`sampling` gives the block
    size per axis). The extent spans the outer cell *edges*, so each cell is
    drawn where it is.
    """
    x, y = config.x_coordinate, config.y_coordinate
    if not config.field:
        raise UserError("Choose a field to plot")
    if x == y:
        raise UserError("x and y must be different coordinates")

    snapshot, timestamp = snapshot_at(fields, time, frame)
    data = single_quantity(config.field, snapshot, variables)
    for coordinate in (x, y):
        if base_of(coordinate) not in data.dims:
            raise QuantityError(f"'{config.field}' does not depend on '{coordinate}'")
    data, used_slices = cut(data, [base_of(x), base_of(y)], config.slices)
    # Transformed axes (`xp`) take the place of their dimensions.
    data = on_axes(data, [x, y])
    # Rows are y and columns x, so the image has y pointing up.
    data = data.transpose(y, x)

    windows = {dim: w for dim, w in config.smoothing.items() if dim in (x, y)}
    zoom = (
        {
            x: sorted((viewport.x_min, viewport.x_max)),
            y: sorted((viewport.y_min, viewport.y_max)),
        }
        if viewport is not None
        else None
    )
    if zoom is not None and windows:
        # Smooth only around the zoom window, with a window's margin.
        data = data.sel(
            {
                dim: slice(lo - windows.get(dim, 0), hi + windows.get(dim, 0))
                for dim, (lo, hi) in zoom.items()
            }
        )
    data, smoothed = smooth(data, windows)
    if zoom is not None:
        data = data.sel({dim: slice(lo, hi) for dim, (lo, hi) in zoom.items()})
        if data.sizes[x] == 0 or data.sizes[y] == 0:
            raise UserError("Selected zoom window is empty")

    x_edges = cell_edges(data.coords[x].values)
    y_edges = cell_edges(data.coords[y].values)
    sampling = {
        "x": block_factor(data.sizes[x], max_size),
        "y": block_factor(data.sizes[y], max_size),
    }
    image = shade(
        block_mean(data.values, (sampling["y"], sampling["x"])),
        config.color_map,
        config.color_scale,
        config.vmin,
        config.vmax,
        config.color_power,
    )
    return {
        **image,
        "timestamp": timestamp if timestamp is not None else float(time),
        "slices": used_slices,
        "sampling": sampling,
        "smoothing": smoothed,
        "extent": {
            "xMin": float(x_edges[0]),
            "xMax": float(x_edges[-1]),
            "yMin": float(y_edges[0]),
            "yMax": float(y_edges[-1]),
        },
    }
