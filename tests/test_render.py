import base64
from io import BytesIO

import matplotlib.image as mpimg
import numpy as np
import pytest

from nt2gui.errors import UserError
from nt2gui.render import color_limits, shade


def decode(result):
    return mpimg.imread(BytesIO(base64.b64decode(result["image"])))


class TestColorLimits:
    def test_linear_follows_finite_data_unless_given(self):
        values = np.array([np.nan, -2.0, 5.0])
        assert color_limits(values, "linear", None, None) == (-2, 5)
        assert color_limits(values, "linear", 0, 10) == (0, 10)

    def test_log_follows_the_positive_data(self):
        values = np.array([-3.0, 0.0, 0.01, 100.0, np.nan])
        assert color_limits(values, "log", None, None) == (0.01, 100)

    def test_log_with_one_limit(self):
        assert color_limits(np.array([0.5, 20.0]), "log", 1, None) == (1, 20)

    def test_constant_data_gets_a_range(self):
        assert color_limits(np.array([3.0, 3.0]), "log", None, None) == (3, 30)
        assert color_limits(np.array([3.0, 3.0]), "linear", None, None) == (3, 6)
        assert color_limits(np.array([0.0]), "linear", None, None) == (0, 1)

    @pytest.mark.parametrize(
        ("values", "scale", "vmin", "message"),
        [
            (np.array([1.0]), "log", 0, "positive minimum"),
            (np.array([-1.0, 0.0]), "log", None, "No positive values"),
            (np.array([1.0]), "cubic", None, "Unknown color scale"),
        ],
    )
    def test_errors(self, values, scale, vmin, message):
        with pytest.raises(UserError, match=message):
            color_limits(values, scale, vmin, None)


class TestShade:
    def test_row_zero_is_at_the_bottom(self):
        values = np.array([[0.0, 0.0], [1.0, 1.0]])  # row 1 (top) bright
        image = decode(shade(values, "gray", "linear"))
        assert image[0, 0, 0] > 0.9 and image[1, 0, 0] < 0.1

    def test_missing_and_non_positive_log_values_are_transparent(self):
        values = np.array([[np.nan, -1.0, 10.0]])
        alpha = decode(shade(values, "viridis", "log"))[..., 3]
        assert alpha.tolist() == [[0, 0, 1]]

    def test_payload(self):
        result = shade(np.ones((3, 5)), "magma", "linear", 0, 2)
        assert result["imageSize"] == {"width": 5, "height": 3}
        assert result["colorbar"]["vmin"] == 0 and result["colorbar"]["vmax"] == 2
        assert result["colorbar"]["scale"] == "linear"
        assert len(result["colorbar"]["colors"]) == 128

    def test_unknown_colormap(self):
        with pytest.raises(UserError, match="Unknown colormap"):
            shade(np.ones((1, 1)), "nope", "linear")
