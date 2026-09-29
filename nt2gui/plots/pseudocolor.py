"""2D slices through fields (pseudocolor plots), shaded on the server."""

from typing import Any

import numpy as np
import xarray as xr

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


def render_pseudocolor(
    fields: xr.Dataset,
    config: PseudocolorConfig,
    time: float,
    viewport: ZoomWindow | None = None,
) -> dict[str, Any]:
    """Shade one field (or expression) over (x, y) at `time`.

    Dims beyond x/y are cut at `config.slices` (the middle by default). With
    a `viewport`, only the cells inside it are shaded. The extent spans the
    outer cell *edges*, so each cell is drawn where it is.
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
    image = shade(
        np.asarray(data.values, dtype=float),
        config.color_map,
        config.color_scale,
        config.vmin,
        config.vmax,
    )
    return {
        **image,
        "timestamp": timestamp if timestamp is not None else float(time),
        "slices": used_slices,
        "extent": {
            "xMin": float(x_edges[0]),
            "xMax": float(x_edges[-1]),
            "yMin": float(y_edges[0]),
            "yMax": float(y_edges[-1]),
        },
    }
