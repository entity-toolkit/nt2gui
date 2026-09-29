import numpy as np
import pytest
import xarray as xr

from fields import field_metadata, render_line, resolve_quantities, vector_groups


def make_dataset():
    t = np.array([0.0, 1.0])
    x = np.linspace(0, 4, 5)
    y = np.array([-1.0, 0.0, 1.0])
    z = np.array([10.0, 20.0])
    xx, yy, tt = np.meshgrid(x, y, t, indexing="ij")
    xyzt = np.meshgrid(x, y, z, t, indexing="ij")
    return xr.Dataset(
        data_vars={
            # Values encode their coordinates so slices are easy to check.
            "Bx": (("x", "y", "t"), xx + 10 * yy + 100 * tt),
            "By": (("x", "y", "t"), -(xx + 10 * yy + 100 * tt)),
            "Bz": (("x", "y", "t"), 0 * xx),
            "N_1": (("x", "y", "t"), xx * 0 + 1),
            "rho": (("x", "y", "z", "t"), xyzt[0] + 1000 * xyzt[2]),
            "profile": (("x",), x**2),
        },
        coords={"t": t, "x": x, "y": y, "z": z},
    )


class TestVectorGroups:
    def test_groups_components_in_xyz_order(self):
        assert vector_groups(["Bz", "Bx", "By", "N_1"]) == {"B": ["Bx", "By", "Bz"]}

    def test_needs_at_least_two_components(self):
        assert vector_groups(["Ex", "rho"]) == {}

    def test_partial_vectors_are_grouped(self):
        assert vector_groups(["ux", "uy"]) == {"u": ["ux", "uy"]}

    def test_underscore_separated_components(self):
        assert vector_groups(["B_x", "B_y", "B_z"]) == {"B": ["B_x", "B_y", "B_z"]}

    def test_scalar_with_the_same_name_wins(self):
        assert vector_groups(["f", "fx", "fy", "fz"]) == {}

    def test_single_letter_names_are_not_components(self):
        assert vector_groups(["x", "y", "z"]) == {}


class TestResolveQuantities:
    def test_vector_expands_and_fields_pass_through(self):
        ds = make_dataset()
        assert resolve_quantities(["B", "N_1"], ds) == ["Bx", "By", "Bz", "N_1"]

    def test_single_component_is_just_that_component(self):
        assert resolve_quantities(["Bx"], make_dataset()) == ["Bx"]

    def test_duplicates_are_dropped_keeping_first_position(self):
        assert resolve_quantities(["By", "B"], make_dataset()) == ["By", "Bx", "Bz"]

    def test_unknown_quantity_raises(self):
        with pytest.raises(KeyError):
            resolve_quantities(["nope"], make_dataset())


def test_field_metadata_lists_fields_vectors_and_used_coords():
    meta = field_metadata(make_dataset())

    assert {"name": "rho", "dims": ["x", "y", "z"]} in meta["fields"]
    assert {"name": "profile", "dims": ["x"]} in meta["fields"]
    assert meta["vectors"] == [{"name": "B", "components": ["Bx", "By", "Bz"]}]
    assert set(meta["coords"]) == {"x", "y", "z"}  # time is not a spatial coord
    assert meta["coords"]["y"] == [-1.0, 0.0, 1.0]


class TestRenderLine:
    def test_slices_other_dims_at_nearest_coordinate_and_time(self):
        result = render_line(make_dataset(), ["Bx"], "x", {"y": 0.9}, time=0.8)

        assert result["axis"] == "x"
        assert result["coordinates"] == [0, 1, 2, 3, 4]
        assert result["slices"] == {"y": 1.0}
        assert result["timestamp"] == 1.0
        assert result["series"] == [{"name": "Bx", "values": [110, 111, 112, 113, 114]}]

    def test_unspecified_slices_default_to_the_middle(self):
        result = render_line(make_dataset(), ["rho"], "y", {}, time=0)

        # x has 5 points -> index 2 (x=2); z has 2 points -> index 1 (z=20)
        assert result["slices"] == {"x": 2.0, "z": 20.0}
        assert result["series"][0]["values"] == [20002.0] * 3

    def test_vector_produces_one_series_per_component(self):
        result = render_line(make_dataset(), ["B"], "y", {"x": 1}, time=0)

        assert [s["name"] for s in result["series"]] == ["Bx", "By", "Bz"]
        assert result["series"][0]["values"] == [-9, 1, 11]

    def test_one_dimensional_field_needs_no_slices(self):
        result = render_line(make_dataset(), ["profile"], "x", {}, time=0)

        assert result["slices"] == {}
        assert result["timestamp"] is None
        assert result["series"][0]["values"] == [0, 1, 4, 9, 16]

    def test_range_keeps_one_point_beyond_each_edge(self):
        x = np.linspace(0, 9, 10)
        ds = xr.Dataset({"p": (("x",), x**2)}, coords={"x": x})

        result = render_line(ds, ["p"], "x", {}, time=0, value_range={"min": 5.5, "max": 2.5})

        assert result["coordinates"] == [2, 3, 4, 5, 6]
        assert result["series"][0]["values"] == [4, 9, 16, 25, 36]

    def test_range_is_clamped_at_the_data_edges(self):
        result = render_line(
            make_dataset(), ["profile"], "x", {}, time=0, value_range={"min": -3, "max": 0.5}
        )

        # Only x=0 is inside; nothing exists below it, one point is added above.
        assert result["coordinates"] == [0, 1]

    def test_range_between_two_grid_points_selects_its_neighbours(self):
        result = render_line(
            make_dataset(), ["profile"], "x", {}, 0, {"min": 1.2, "max": 1.4}
        )

        assert result["coordinates"] == [0, 1, 2, 3]

    def test_range_outside_the_data_is_an_error(self):
        with pytest.raises(ValueError, match="outside"):
            render_line(make_dataset(), ["profile"], "x", {}, 0, {"min": 7, "max": 9})

    def test_field_without_the_axis_is_an_error(self):
        with pytest.raises(ValueError, match="does not depend on 'z'"):
            render_line(make_dataset(), ["Bx"], "z", {}, time=0)

    def test_nothing_selected_is_an_error(self):
        with pytest.raises(ValueError, match="at least one"):
            render_line(make_dataset(), [], "x", {}, time=0)

    def test_non_finite_values_become_null(self):
        ds = make_dataset()
        ds["profile"][1] = np.nan
        result = render_line(ds, ["profile"], "x", {}, time=0)

        assert result["series"][0]["values"][1] is None
