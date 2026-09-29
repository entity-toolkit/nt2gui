import base64
from io import BytesIO

import matplotlib.image as mpimg
import numpy as np
import pytest
import xarray as xr
from matplotlib.colors import LogNorm

from nt2gui.pseudocolor import color_norm, log_ticks, render_pseudocolor


def make_dataset(values):
    x = np.linspace(0, 1, values.shape[0])
    y = np.linspace(0, 1, values.shape[1])
    return xr.Dataset({"f": (("x", "y"), values)}, coords={"x": x, "y": y})


class TestColorNorm:
    def test_linear_keeps_given_limits(self):
        norm = color_norm(np.array([1.0, 5.0]), "linear", 0, 10)
        assert (norm.vmin, norm.vmax) == (0, 10)

    def test_log_defaults_to_the_positive_data(self):
        norm = color_norm(np.array([-3.0, 0.0, 0.01, 100.0, np.nan]), "log", None, None)
        assert isinstance(norm, LogNorm)
        assert (norm.vmin, norm.vmax) == (0.01, 100.0)

    def test_log_with_one_limit(self):
        norm = color_norm(np.array([0.5, 20.0]), "log", 1, None)
        assert (norm.vmin, norm.vmax) == (1, 20)

    def test_log_constant_data_gets_a_decade(self):
        norm = color_norm(np.array([3.0, 3.0]), "log", None, None)
        assert (norm.vmin, norm.vmax) == (3, 30)

    @pytest.mark.parametrize(
        ("values", "vmin", "message"),
        [
            (np.array([1.0]), 0, "positive minimum"),
            (np.array([-1.0, 0.0]), None, "No positive values"),
        ],
    )
    def test_log_errors(self, values, vmin, message):
        with pytest.raises(ValueError, match=message):
            color_norm(values, "log", vmin, None)

    def test_unknown_scale(self):
        with pytest.raises(ValueError, match="Unknown color scale"):
            color_norm(np.array([1.0]), "cubic", None, None)


class TestLogTicks:
    def test_decades(self):
        assert log_ticks(0.01, 1000) == [0.01, 0.1, 1, 10, 100, 1000]

    def test_falls_back_to_finer_steps_within_a_decade(self):
        assert log_ticks(1.5, 8) == [2, 5]
        assert log_ticks(1.1, 1.9) == [1.1, 1.9]

    def test_mixed(self):
        assert log_ticks(3, 400) == [10, 100]


def decode(result):
    return mpimg.imread(BytesIO(base64.b64decode(result["image"])))


def test_log_render_leaves_non_positive_values_transparent():
    values = np.ones((20, 10))
    values[:10] = -1.0  # left half (x < 0.5) negative
    values[10:] = np.logspace(0, 2, 10)[:, None]

    result = render_pseudocolor(
        make_dataset(values),
        {"field": "f", "xCoordinate": "x", "yCoordinate": "y", "colorScale": "log"},
        0,
    )

    image = decode(result)
    alpha = image[..., 3]
    middle = image.shape[0] // 2
    assert alpha[middle, 5] == 0  # negative: transparent
    assert alpha[middle, -5] == 1  # positive: drawn
    colorbar = result["colorbar"]
    assert colorbar["scale"] == "log"
    assert colorbar["vmin"] == pytest.approx(1) and colorbar["vmax"] == pytest.approx(100)
    assert colorbar["labels"] == ["1", "10", "100"]


def test_linear_render_is_unchanged_and_reports_its_scale():
    result = render_pseudocolor(
        make_dataset(np.linspace(-1, 1, 200).reshape(20, 10)),
        {"field": "f", "xCoordinate": "x", "yCoordinate": "y", "vmin": -2, "vmax": 2},
        0,
    )
    assert result["colorbar"]["scale"] == "linear"
    assert (result["colorbar"]["vmin"], result["colorbar"]["vmax"]) == (-2, 2)


def test_log_of_negative_only_field_is_an_error():
    with pytest.raises(ValueError, match="No positive values"):
        render_pseudocolor(
            make_dataset(-np.ones((4, 4))),
            {"field": "f", "xCoordinate": "x", "yCoordinate": "y", "colorScale": "log"},
            0,
        )
