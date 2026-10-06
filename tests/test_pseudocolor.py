import base64
from io import BytesIO

import matplotlib.image as mpimg
import numpy as np
import pytest
import xarray as xr

from nt2gui.errors import UserError
from nt2gui.plots.pseudocolor import render_pseudocolor
from nt2gui.session.schema import PseudocolorConfig, ZoomWindow


def make_dataset(values, x=None, y=None):
    x = np.linspace(0, 1, values.shape[0]) if x is None else x
    y = np.linspace(0, 1, values.shape[1]) if y is None else y
    return xr.Dataset({"f": (("x", "y"), values)}, coords={"x": x, "y": y})


def config(**extra):
    return PseudocolorConfig.model_validate({"field": "f", "colorMap": "gray"} | extra)


def decode(result):
    return mpimg.imread(BytesIO(base64.b64decode(result["image"])))


def test_y_is_vertical_and_x_horizontal():
    # Non-square grid, value increasing along x only.
    xx, _ = np.meshgrid(np.linspace(0, 1, 40), np.linspace(0, 1, 10), indexing="ij")
    result = render_pseudocolor(make_dataset(xx), config(), 0)

    image = decode(result)[..., 0]
    assert image.shape == (10, 40)
    assert image[5, -2] > image[5, 1] + 0.5  # brighter to the right
    assert np.ptp(image[:, 20]) < 0.05  # constant top to bottom


def test_extent_spans_the_outer_cell_edges():
    x = np.array([0.5, 1.5, 2.5, 3.5])
    y = np.array([10.0, 20.0])
    result = render_pseudocolor(make_dataset(np.ones((4, 2)), x, y), config(), 0)
    assert result["extent"] == {"xMin": 0, "xMax": 4, "yMin": 5, "yMax": 25}


def test_viewport_shades_only_the_cells_inside():
    x = np.arange(10) + 0.5
    result = render_pseudocolor(
        make_dataset(np.ones((10, 4)), x=x),
        config(),
        0,
        ZoomWindow(x_min=2, x_max=5, y_min=0, y_max=1),
    )
    assert result["imageSize"]["width"] == 3  # cells at 2.5, 3.5, 4.5
    assert result["extent"]["xMin"] == 2 and result["extent"]["xMax"] == 5


def test_empty_viewport_is_an_error():
    with pytest.raises(UserError, match="zoom window is empty"):
        render_pseudocolor(
            make_dataset(np.ones((4, 4))),
            config(),
            0,
            ZoomWindow(x_min=0.1, x_max=0.2, y_min=0.1, y_max=0.2),
        )


def test_log_colors_leave_non_positive_values_transparent():
    values = np.ones((20, 10))
    values[:10] = -1.0  # x < 0.5 negative
    values[10:] = np.logspace(0, 2, 10)[:, None]

    result = render_pseudocolor(make_dataset(values), config(colorScale="log"), 0)

    alpha = decode(result)[..., 3]
    assert alpha[5, 2] == 0 and alpha[5, -2] == 1
    colorbar = result["colorbar"]
    assert colorbar["scale"] == "log"
    assert colorbar["vmin"] == pytest.approx(1) and colorbar["vmax"] == pytest.approx(
        100
    )


def test_linear_limits_and_timestamp_of_static_data():
    result = render_pseudocolor(
        make_dataset(np.linspace(-1, 1, 200).reshape(20, 10)),
        config(vmin=-2, vmax=2),
        0.7,
    )
    assert (result["colorbar"]["vmin"], result["colorbar"]["vmax"]) == (-2, 2)
    assert result["timestamp"] == 0.7


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        ({"field": ""}, "Choose a field"),
        ({"yCoordinate": "x"}, "must be different"),
        ({"yCoordinate": "z"}, "does not depend on 'z'"),
        ({"colorScale": "log"}, "No positive values"),
    ],
)
def test_invalid_requests(extra, message):
    with pytest.raises(UserError, match=message):
        render_pseudocolor(make_dataset(-np.ones((4, 4))), config(**extra), 0)


def test_large_slices_are_averaged_and_zooming_recovers_full_resolution():
    values = np.arange(100.0 * 30).reshape(100, 30)  # 100 cells along x
    ds = make_dataset(values, x=np.arange(100.0), y=np.arange(30.0))

    full = render_pseudocolor(ds, config(), 0, max_size=40)
    # 100 x-cells in blocks of 3 (34 pixels, the last one partial); y as is.
    assert full["sampling"] == {"x": 3, "y": 1}
    assert full["imageSize"] == {"width": 34, "height": 30}
    # The extent still spans every cell.
    assert full["extent"]["xMin"] == -0.5 and full["extent"]["xMax"] == 99.5
    # Block averages set the color range: the first block is cells 0..2.
    assert full["colorbar"]["vmin"] == pytest.approx(values[:3, 0].mean())

    window = ZoomWindow(x_min=10, x_max=40, y_min=0, y_max=29)
    zoomed = render_pseudocolor(ds, config(), 0, window, max_size=40)
    assert zoomed["sampling"] == {"x": 1, "y": 1}
    assert zoomed["imageSize"] == {"width": 31, "height": 30}
