import numpy as np
import pandas as pd
import pytest

from nt2gui.data.particles import (
    bin_edges,
    builtin_quantities,
    default_scale,
    from_scaled,
    histogram_1d,
    histogram_2d,
    particle_dataset,
    quantity_values,
    required_columns,
    sample_dataset,
    species_mask,
    to_scaled,
)
from nt2gui.plots.particle_phase import render_particle_phase
from nt2gui.session.schema import ParticleAxis, ParticlePhaseConfig


def axis(quantity, scale="linear", **extra):
    return ParticleAxis(quantity=quantity, scale=scale, **extra)


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
        assert builtin_quantities(["x", "ux", "uy", "uz", "w"]) == [
            "x", "ux", "uy", "uz", "gamma", "energy", "w",
        ]
        # gamma/energy need all three velocity components
        assert builtin_quantities(["x", "ux", "w"]) == ["x", "ux", "w"]

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
        np.testing.assert_allclose(
            from_scaled(to_scaled(values, kind, 0.3), kind, 0.3), values
        )

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
        result = histogram_1d(ds, axis("x", bins=4), [[1], [2, 3], []])

        np.testing.assert_allclose(result["edges"], [0, 1, 2, 3, 4])
        counts = [line["counts"] for line in result["series"]]
        assert counts[0] == [1, 2, 0, 0]  # species 1: x=0 (w1), x=1 (w2)
        assert counts[1] == [0, 0, 3, 9]  # species 2+3; last bin is closed
        assert counts[2] == [1, 2, 3, 9]  # all species
        assert [line["species"] for line in result["series"]] == [[1], [2, 3], []]

    def test_log_scale_reports_excluded_weight(self, ds):
        result = histogram_1d(ds, axis("energy", "log", bins=2), [[2]])

        # Species 2 has energies 0 (weight 3, excluded) and 1 (weight 4).
        line = result["series"][0]
        assert sum(line["counts"]) == 4
        assert line["excludedWeight"] == 3

    def test_edges_are_in_data_units(self, ds):
        result = histogram_1d(ds, axis("energy", "log", bins=2, min=1, max=100), [[]])
        np.testing.assert_allclose(result["edges"], [1, 10, 100])

    def test_needs_a_series(self, ds):
        with pytest.raises(ValueError, match="at least one line"):
            histogram_1d(ds, axis("x", bins=4), [])


class TestHistogram2D:
    def test_counts_are_weighted_and_indexed_y_then_x(self, ds):
        result = histogram_2d(
            ds, axis("x", bins=2, min=0, max=4), axis("ux", bins=2, min=-4, max=4), [1]
        )

        # Species 1: (x=0, ux=3, w=1) and (x=1, ux=-3, w=2).
        np.testing.assert_allclose(result["counts"], [[2, 0], [1, 0]])
        np.testing.assert_allclose(result["edges"][0], [0, 2, 4])

    def test_power_scaled_axis(self, ds):
        result = histogram_2d(
            ds,
            axis("x", bins=1),
            axis("ux", "power", power=0.5, bins=2, min=-4, max=4),
            [],
        )
        np.testing.assert_allclose(result["edges"][1], [-4, 0, 4])
        assert result["counts"].sum() == pytest.approx(15)

    def test_species_mask(self, ds):
        assert species_mask(ds, []).all()
        assert species_mask(ds, [3]).tolist() == [False] * 4 + [True]


class TestPhasePlot:
    def config(self, **extra):
        return ParticlePhaseConfig(
            x=axis("x", bins=2, min=0, max=4),
            y=axis("ux", bins=2, min=-4, max=4),
            **extra,
        )

    def test_extent_is_the_outer_bin_edges(self, ds):
        result = render_particle_phase(ds, self.config(species=[1]))
        assert result["extent"] == {"xMin": 0, "xMax": 4, "yMin": -4, "yMax": 4}
        assert result["imageSize"] == {"width": 2, "height": 2}

    def test_log_colors_follow_the_non_empty_bins(self, ds):
        colorbar = render_particle_phase(ds, self.config(species=[1]))["colorbar"]
        assert (colorbar["vmin"], colorbar["vmax"], colorbar["scale"]) == (1, 2, "log")

    def test_linear_colors_start_at_zero(self, ds):
        colorbar = render_particle_phase(ds, self.config(colorScale="linear"))[
            "colorbar"
        ]
        assert colorbar["vmin"] == 0


class TestRequiredColumns:
    columns = ["x", "y", "ux", "uy", "uz", "w"]

    @pytest.mark.parametrize(
        ("quantities", "expected"),
        [
            (["x"], ["x", "w"]),
            (["energy"], ["ux", "uy", "uz", "w"]),
            (["x", "gamma"], ["x", "ux", "uy", "uz", "w"]),
            (["(gamma - 1) * w"], ["ux", "uy", "uz", "w"]),
            (["sqrt(ux**2 + uy**2)"], ["ux", "uy", "w"]),
            (["x +"], ["w"]),  # invalid: evaluating it reports the error
            (["pi * x"], ["x", "w"]),  # constants and functions aren't columns
        ],
    )
    def test_reads_only_what_the_quantities_use(self, quantities, expected):
        columns = required_columns(quantities, self.columns)
        assert sorted(columns) == sorted(expected) and len(columns) == len(set(columns))

    def test_spherical_velocity(self):
        assert required_columns(["gamma"], ["r", "ur", "uth", "uph"]) == ["ur", "uth", "uph"]


def test_sample_dataset_validates_expressions_without_data():
    sample = sample_dataset(["x", "ux", "uy", "uz", "w"])
    assert quantity_values("(gamma - 1) * w", sample).shape == (16,)
    with pytest.raises(ValueError):
        quantity_values("nope + x", sample)
