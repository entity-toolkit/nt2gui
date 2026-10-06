"""2D slices through fields (pseudocolor plots), shaded on the server."""

from typing import Any

import xarray as xr

from ..data.arrays import block_factor, block_mean
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

    snapshot, timestamp = snapshot_at(fields, time)
    data = single_quantity(config.field, snapshot)
    for coordinate in (x, y):
        if coordinate not in data.dims:
            raise QuantityError(f"'{config.field}' does not depend on '{coordinate}'")
    data, used_slices = cut(data, [x, y], config.slices)
    # Rows are y and columns x, so the image has y pointing up.
    data = data.transpose(y, x)

    if viewport is not None:
        data = data.sel(
            {
                x: slice(*sorted((viewport.x_min, viewport.x_max))),
                y: slice(*sorted((viewport.y_min, viewport.y_max))),
            }
        )
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
        "extent": {
            "xMin": float(x_edges[0]),
            "xMax": float(x_edges[-1]),
            "yMin": float(y_edges[0]),
            "yMax": float(y_edges[-1]),
        },
    }
