import numpy as np
import pandas as pd
import pytest

from particles import (
    bin_edges,
    builtin_quantities,
    default_scale,
    from_scaled,
    histogram_1d,
    histogram_2d,
    particle_dataset,
    quantity_values,
    render_counts,
    species_mask,
    to_scaled,
)


def make_frame():
    return pd.DataFrame(
        {
            "sp": np.array([1, 1, 2, 2, 3], dtype=np.int32),
            "x": [0.0, 1.0, 2.0, 3.0, 4.0],
            "ux": [3.0, -3.0, 0.0, 1.0, 4.0],
            "uy": [4.0, 0.0, 0.0, 0.0, 3.0],
            "uz": [0.0, 4.0, 0.0, 0.0, 0.0],
            "w": [1.0, 2.0, 3.0, 4.0, 5.0],
        }
    )


@pytest.fixture
def ds():
    return particle_dataset(make_frame())


class TestDataset:
    def test_derived_gamma_and_energy(self, ds):
        np.testing.assert_allclose(ds["energy"].values, [5, 5, 0, 1, 5])
        np.testing.assert_allclose(ds["gamma"].values, np.sqrt([26, 26, 1, 2, 26]))

    def test_builtins_cover_present_columns_only(self, ds):
        assert builtin_quantities(ds) == ["x", "ux", "uy", "uz", "gamma", "energy", "w"]

    def test_missing_weights_default_to_one(self):
        ds = particle_dataset(make_frame().drop(columns="w"))
        np.testing.assert_allclose(ds["w"].values, 1)

    def test_default_scales(self):
        assert default_scale("gamma") == "log"
        assert default_scale("energy") == "log"
        assert default_scale("ux") == "linear"

    def test_expressions_over_particle_columns(self, ds):
        np.testing.assert_allclose(quantity_values("ux * w", ds), [3, -6, 0, 4, 20])
        np.testing.assert_allclose(quantity_values("gamma - 1", ds)[2], 0)

    def test_expression_must_be_per_particle(self, ds):
        with pytest.raises(ValueError):
            quantity_values("nope + 1", ds)


class TestScales:
    @pytest.mark.parametrize("kind", ["linear", "log", "power"])
    def test_round_trip(self, kind):
        values = np.array([0.01, 0.5, 2.0, 1000.0])
        np.testing.assert_allclose(from_scaled(to_scaled(values, kind, 0.3), kind, 0.3), values)

    def test_power_scale_keeps_the_sign(self):
        np.testing.assert_allclose(
            to_scaled(np.array([-4.0, 0.0, 9.0]), "power", 0.5), [-2, 0, 3]
        )
        np.testing.assert_allclose(
            from_scaled(np.array([-2.0, 3.0]), "power", 0.5), [-4, 9]
        )

    def test_log_scale_drops_non_positive_values(self):
        scaled = to_scaled(np.array([-1.0, 0.0, 100.0]), "log")
        assert np.isnan(scaled[:2]).all() and scaled[2] == 2

    def test_invalid_power(self):
        with pytest.raises(ValueError, match="positive"):
            to_scaled(np.array([1.0]), "power", 0)


class TestBinEdges:
    def test_uniform_in_scaled_space_over_the_data(self):
        edges = bin_edges(np.array([0.0, 2.0]), 4, "log", 0.5)
        np.testing.assert_allclose(edges, [0, 0.5, 1, 1.5, 2])

    def test_user_range_in_data_units(self):
        edges = bin_edges(np.array([0.0, 5.0]), 2, "log", 0.5, lower=1, upper=100)
        np.testing.assert_allclose(from_scaled(edges, "log"), [1, 10, 100])

    def test_single_value_gets_a_visible_bin(self):
        edges = bin_edges(np.array([3.0, 3.0]), 1, "linear", 0.5)
        assert edges[0] < 3 < edges[1]

    @pytest.mark.parametrize(
        ("kwargs", "message"),
        [
            ({"bins": 0}, "between"),
            ({"bins": 5000}, "between"),
            ({"lower": -1.0, "kind": "log"}, "invalid for a log"),
            ({"lower": 5.0, "upper": 1.0}, "below the maximum"),
        ],
    )
    def test_invalid(self, kwargs, message):
        args = {"bins": 4, "kind": "linear", "power": 0.5} | kwargs
        with pytest.raises(ValueError, match=message):
            bin_edges(np.array([1.0, 2.0]), **args)


class TestHistogram1D:
    def test_weighted_counts_per_series_share_bins(self, ds):
        result = histogram_1d(ds, "x", "linear", 0.5, 4, [[1], [2, 3], []])

        np.testing.assert_allclose(result["edges"], [0, 1, 2, 3, 4])
        counts = [line["counts"] for line in result["series"]]
        assert counts[0] == [1, 2, 0, 0]  # species 1: x=0 (w1), x=1 (w2)
        assert counts[1] == [0, 0, 3, 9]  # species 2+3; last bin is closed
        assert counts[2] == [1, 2, 3, 9]  # all species
        assert [line["species"] for line in result["series"]] == [[1], [2, 3], []]

    def test_log_scale_reports_excluded_weight(self, ds):
        result = histogram_1d(ds, "energy", "log", 0.5, 2, [[2]])

        # Species 2 has energies 0 (weight 3, excluded) and 1 (weight 4).
        line = result["series"][0]
        assert sum(line["counts"]) == 4
        assert line["excludedWeight"] == 3

    def test_edges_are_in_data_units(self, ds):
        result = histogram_1d(ds, "energy", "log", 0.5, 2, [[]], lower=1, upper=100)
        np.testing.assert_allclose(result["edges"], [1, 10, 100])

    def test_needs_a_series(self, ds):
        with pytest.raises(ValueError, match="at least one line"):
            histogram_1d(ds, "x", "linear", 0.5, 4, [])


class TestHistogram2D:
    def test_counts_are_weighted_and_indexed_y_then_x(self, ds):
        axes = [
            {"quantity": "x", "scale": "linear", "power": 0.5, "bins": 2, "min": 0, "max": 4},
            {"quantity": "ux", "scale": "linear", "power": 0.5, "bins": 2, "min": -4, "max": 4},
        ]
        result = histogram_2d(ds, axes, [1])

        # Species 1: (x=0, ux=3, w=1) and (x=1, ux=-3, w=2).
        np.testing.assert_allclose(result["counts"], [[2, 0], [1, 0]])
        np.testing.assert_allclose(result["edges"][0], [0, 2, 4])

    def test_power_scaled_axis(self, ds):
        axes = [
            {"quantity": "x", "scale": "linear", "power": 0.5, "bins": 1},
            {"quantity": "ux", "scale": "power", "power": 0.5, "bins": 2, "min": -4, "max": 4},
        ]
        result = histogram_2d(ds, axes, [])
        np.testing.assert_allclose(result["edges"][1], [-4, 0, 4])
        assert result["counts"].sum() == pytest.approx(15)

    def test_species_mask(self, ds):
        assert species_mask(ds, []).all()
        assert species_mask(ds, [3]).tolist() == [False] * 4 + [True]


class TestRenderCounts:
    def test_log_color_scale_limits_follow_positive_counts(self):
        result = render_counts(np.array([[0.0, 2.0], [20.0, 0.0]]), "viridis", "log", None, None)
        assert result["colorbar"] == {
            "vmin": 2.0,
            "vmax": 20.0,
            "scale": "log",
            "colors": result["colorbar"]["colors"],
        }
        assert result["imageSize"] == {"width": 2, "height": 2}
        assert len(result["colorbar"]["colors"]) == 128

    def test_user_limits_and_errors(self):
        counts = np.ones((2, 2))
        assert render_counts(counts, "magma", "linear", 0, 5)["colorbar"]["vmax"] == 5
        with pytest.raises(ValueError, match="positive minimum"):
            render_counts(counts, "viridis", "log", 0, None)
        with pytest.raises(ValueError, match="Unknown colormap"):
            render_counts(counts, "nope", "log", None, None)
