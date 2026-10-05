import numpy as np
import pandas as pd
import pytest

from nt2gui.data.particles import particle_dataset
from nt2gui.data.regions import (
    region_coordinates,
    region_mask,
    regions_mask,
    resolve_regions,
)
from nt2gui.errors import UserError
from nt2gui.session.schema import Region


@pytest.fixture
def ds():
    # A 3x3 grid of particles at x, y in {0, 1, 2}.
    x, y = np.meshgrid([0.0, 1.0, 2.0], [0.0, 1.0, 2.0])
    frame = pd.DataFrame({"x": x.ravel(), "y": y.ravel(), "sp": np.ones(9, int)})
    return particle_dataset(frame)


def region(name="r", **fields):
    return Region.model_validate({"name": name, **fields})


def inside(ds, mask):
    return sorted(zip(ds["x"].values[mask].tolist(), ds["y"].values[mask].tolist()))


def test_band_keeps_the_range_of_one_coordinate(ds):
    band = region(ranges={"x": {"min": 0.5, "max": 2}})
    assert inside(ds, region_mask(ds, band)) == [
        (1, 0), (1, 1), (1, 2), (2, 0), (2, 1), (2, 2)
    ]


def test_box_constrains_every_coordinate(ds):
    box = region(ranges={"x": {"min": 0, "max": 1}, "y": {"min": 1, "max": 2}})
    assert inside(ds, region_mask(ds, box)) == [(0, 1), (0, 2), (1, 1), (1, 2)]


def test_lasso_is_a_point_in_polygon_test(ds):
    # A triangle around (1, 1) only.
    lasso = region(
        polygon={"x": "x", "y": "y", "points": [[0.5, 0.5], [1.5, 0.5], [1, 1.6]]}
    )
    assert inside(ds, region_mask(ds, lasso)) == [(1, 1)]


def test_polygon_coordinates_may_be_swapped(ds):
    # Polygon given as (y, x): a thin band around y = 2 restricted to x <= 0.5.
    lasso = region(
        polygon={
            "x": "y",
            "y": "x",
            "points": [[1.5, -0.5], [2.5, -0.5], [2.5, 0.5], [1.5, 0.5]],
        }
    )
    assert inside(ds, region_mask(ds, lasso)) == [(0, 2)]


def test_union_of_regions_and_no_regions_means_everything(ds):
    left = region("a", ranges={"x": {"min": -1, "max": 0}})
    top = region("b", ranges={"y": {"min": 1.5, "max": 3}})
    assert len(inside(ds, regions_mask(ds, [left, top]))) == 5
    assert regions_mask(ds, []).all()


def test_missing_coordinate_is_a_user_error(ds):
    deep = region("deep", ranges={"z": {"min": 0, "max": 1}})
    with pytest.raises(UserError, match="'deep' needs the particles' 'z'"):
        region_mask(ds, deep)


def test_resolve_and_columns():
    a = region("a", ranges={"x": {"min": 0, "max": 1}})
    b = region("b", polygon={"x": "y", "y": "z", "points": [[0, 0], [1, 0], [0, 1]]})
    available = {"a": a, "b": b}
    assert resolve_regions(["b", "a", "b"], available) == [b, a]
    assert region_coordinates([a, b]) == ["x", "y", "z"]
    with pytest.raises(UserError, match="Unknown region 'c'"):
        resolve_regions(["c"], available)


@pytest.mark.parametrize(
    "fields",
    [
        {},
        {"ranges": {"x": {"min": 1, "max": 0}}},
        {"polygon": {"x": "x", "y": "y", "points": [[0, 0], [1, 1]]}},
    ],
)
def test_invalid_regions_are_rejected(fields):
    with pytest.raises(ValueError):
        region(**fields)
