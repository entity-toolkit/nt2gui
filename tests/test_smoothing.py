import base64
from io import BytesIO

import matplotlib.image as mpimg
import numpy as np
import pytest
import xarray as xr

from nt2gui.data.arrays import boxcar
from nt2gui.data.smoothing import half_width, smooth
from nt2gui.plots.line import render_line
from nt2gui.plots.pseudocolor import render_pseudocolor
from nt2gui.session.schema import PseudocolorConfig, ZoomWindow


def reference(values, half):
    """Plain moving average over the finite neighbours (truncated at ends)."""
    out = np.full(len(values), np.nan)
    for i in range(len(values)):
        window = values[max(i - half, 0) : i + half + 1]
        window = window[np.isfinite(window)]
        if np.isfinite(values[i]) and window.size:
            out[i] = window.mean()
    return out


class TestBoxcar:
    def test_matches_a_plain_moving_average(self):
        rng = np.random.default_rng(1)
        values = rng.normal(size=50)
        values[[3, 20, 21]] = np.nan
        assert np.allclose(
            boxcar(values, 0, 3), reference(values, 3), equal_nan=True
        )

    def test_along_either_axis_of_an_image(self):
        image = np.arange(30.0).reshape(5, 6)
        rows = boxcar(image, 1, 1)
        assert np.allclose(rows[2], reference(image[2], 1))
        columns = boxcar(image, 0, 2)
        assert np.allclose(columns[:, 4], reference(image[:, 4], 2))

    def test_zero_width_is_a_copy(self):
        values = np.array([1.0, 2.0])
        result = boxcar(values, 0, 0)
        assert result.tolist() == [1.0, 2.0] and result is not values


class TestHalfWidth:
    @pytest.mark.parametrize(
        ("window", "half"), [(0.1, 0), (0.25, 1), (0.3, 1), (0.5, 2), (1.0, 5)]
    )
    def test_window_in_coordinate_units(self, window, half):
        # Spacing 0.1: a window of 0.3 spans 3 cells.
        assert half_width(np.linspace(0, 1, 11), window) == half

    def test_degenerate_grids(self):
        assert half_width(np.array([1.0]), 5) == 0
        assert half_width(np.zeros(4), 5) == 0


def test_smooth_reports_cells_and_skips_unknown_dims():
    data = xr.DataArray(
        np.arange(20.0).reshape(4, 5),
        dims=("y", "x"),
        coords={"x": np.arange(5.0), "y": np.arange(4.0)},
    )
    smoothed, used = smooth(data, {"x": 3, "z": 2})
    assert used == {"x": 3}
    assert np.allclose(smoothed.values[1], reference(data.values[1], 1))
    same, none = smooth(data, {"x": 0.5})
    assert same is data and none == {}


def test_line_smoothing_is_along_the_axis_and_survives_zoom():
    x = np.arange(100.0)
    values = np.where(np.arange(100) % 2 == 0, 1.0, -1.0)
    ds = xr.Dataset({"f": ("x", values)}, coords={"x": x})
    full = render_line(ds, ["f"], "x", {}, 0, smoothing={"x": 2.0, "y": 9.0})
    assert full["smoothing"] == {"x": 3}
    assert full["series"][0]["values"][10] == pytest.approx(-1 / 3)
    zoomed = render_line(
        ds, ["f"], "x", {}, 0, {"min": 10, "max": 20}, smoothing={"x": 2.0}
    )
    first = zoomed["coordinates"].index(10.0)
    assert zoomed["series"][0]["values"][first] == pytest.approx(-1 / 3)
    assert render_line(ds, ["f"], "x", {}, 0)["smoothing"] == {}


def test_pseudocolor_zoom_matches_the_smoothed_full_image():
    rng = np.random.default_rng(0)
    values = rng.normal(size=(40, 30))
    ds = xr.Dataset(
        {"f": (("x", "y"), values)},
        coords={"x": np.arange(40.0), "y": np.arange(30.0)},
    )
    config = PseudocolorConfig.model_validate(
        {"field": "f", "smoothing": {"x": 5, "y": 3}, "vmin": -1, "vmax": 1}
    )
    full = render_pseudocolor(ds, config, 0)
    assert full["smoothing"] == {"x": 5, "y": 3}
    zoomed = render_pseudocolor(
        ds, config, 0, ZoomWindow(x_min=10, x_max=20, y_min=5, y_max=15)
    )
    assert zoomed["smoothing"] == {"x": 5, "y": 3}

    def pixels(result):
        # PNG rows run top down; flip so row i is y = i.
        return mpimg.imread(BytesIO(base64.b64decode(result["image"])))[::-1]

    # Same colors as the matching part of the full smoothed image.
    assert np.allclose(pixels(zoomed), pixels(full)[5:16, 10:21])
