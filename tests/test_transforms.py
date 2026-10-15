import numpy as np
import pandas as pd
import pytest
import xarray as xr

from helpers import load_demo, put_state
from nt2gui.data.metadata import field_metadata
from nt2gui.data.particles import particle_dataset
from nt2gui.data.quantities import snapshot_at
from nt2gui.data.transforms import (
    Frame,
    TransformError,
    check_transforms,
    transform_definitions,
)
from nt2gui.plots.line import render_line
from nt2gui.plots.pseudocolor import render_pseudocolor
from nt2gui.session.schema import PseudocolorConfig, UiState, default_session

ATTRS = {
    "grid.extent": np.array([2.0, 12.0], dtype=np.float32),
    "setup.vel": np.float32(0.5),
    "setup.omega": np.float64(10.0),
}


@pytest.fixture
def fields():
    x = np.linspace(2, 12, 11)
    t = np.array([0.0, 1.0, 2.0])
    return xr.Dataset(
        {"f": (("t", "x"), np.tile(x, (3, 1)) + t[:, None])},
        coords={"x": x, "t": t},
    )


class TestFrame:
    def test_coordinates_use_attributes_and_time(self, fields):
        frame = Frame({"x": "(x - grid.extent[0]) - setup.vel * t"}, ATTRS)
        snapshot, timestamp = snapshot_at(fields, 2.0, frame)
        assert timestamp == 2.0
        assert snapshot.x.values[0] == pytest.approx(-1.0)
        assert snapshot.x.values[-1] == pytest.approx(9.0)

    def test_time_is_picked_and_reported_in_transformed_units(self, fields):
        frame = Frame({"t": "t * setup.omega"}, ATTRS)
        snapshot, timestamp = snapshot_at(fields, 9.0, frame)
        # 9 is nearest to 10 (= t 1 in original units).
        assert timestamp == 10.0
        assert snapshot.f.values[0] == pytest.approx(3.0)
        assert snapshot.coords["t"].item() == 10.0

    def test_reversed_grids_are_sorted_again(self, fields):
        snapshot, _ = snapshot_at(fields, 0, Frame({"x": "-x"}))
        assert snapshot.x.values[0] == -12 and snapshot.f.values[0] == 12

    @pytest.mark.parametrize(
        ("transforms", "message"),
        [
            ({"x": "x**2 - 50 + 0*x"}, None),
            ({"x": "(x - 7)**2"}, "increasing or decreasing"),
            ({"x": "setup.nope * x"}, "Unknown attribute 'setup.nope'"),
            ({"x": "grid.extent * x"}, "pick an element"),
            ({"x": "y + 1"}, "Unknown name 'y'"),
            ({"x": "3"}, "must depend on"),
            ({"t": "-t"}, "keep times increasing"),
        ],
    )
    def test_problems_are_named(self, fields, transforms, message):
        frame = Frame(transforms, ATTRS)
        if message is None:
            snapshot_at(fields, 0, frame)
            return
        with pytest.raises(TransformError, match=message):
            snapshot_at(fields, 0, frame)

    def test_particle_positions(self):
        frame = Frame({"x": "x / 2 + t", "ux": "nope"}, ATTRS)
        ds = particle_dataset(
            pd.DataFrame({"x": [2.0, 4.0], "ux": [1.0, 1.0], "w": 1.0, "sp": 1})
        )
        moved = frame.positions(ds, 1.0)
        assert moved.x.values.tolist() == [2.0, 3.0]
        assert moved.ux.values.tolist() == [1.0, 1.0]

    def test_definitions(self):
        assert transform_definitions({"x": " x/2 ", "y": ""}) == {"x": "x/2"}
        with pytest.raises(TransformError, match="Only x"):
            transform_definitions({"ux": "ux"})


class TestPlots:
    def test_line_and_metadata_in_transformed_units(self, fields):
        frame = Frame({"x": "x / 2"}, ATTRS)
        line = render_line(fields, ["f"], "x", {}, 0, {"min": 1, "max": 3}, frame=frame)
        assert line["coordinates"][0] == pytest.approx(1.0)
        assert field_metadata(fields, frame)["coords"]["x"][-1] == pytest.approx(6.0)
        moving = Frame({"x": "x - t"}, ATTRS)
        assert field_metadata(fields, moving, 2.0)["coords"]["x"][0] == 0.0

    def test_pseudocolor_extent(self):
        ds = xr.Dataset(
            {"f": (("x", "y"), np.ones((4, 3)))},
            coords={"x": np.arange(4.0), "y": np.arange(3.0)},
        )
        config = PseudocolorConfig.model_validate({"field": "f"})
        image = render_pseudocolor(ds, config, 0, frame=Frame({"y": "10 * y"}))
        assert image["extent"]["yMin"] == pytest.approx(-5)
        assert image["extent"]["yMax"] == pytest.approx(25)


def test_session_schema_takes_known_coordinates():
    wire = default_session().state.to_wire()
    state = UiState.model_validate(wire | {"coordinateTransforms": {"x": "x/2"}})
    assert state.coordinate_transforms == {"x": "x/2"}
    with pytest.raises(ValueError):
        UiState.model_validate(wire | {"coordinateTransforms": {"ux": "ux"}})


class TestApi:
    def test_renders_check_and_timeline(self, client):
        sim = load_demo(client)
        transforms = {
            "x": "(x - grid.extent[0]) / 2",
            "t": "t * 100",
        }
        check = client.post(
            f"/api/simulations/{sim}/transforms/check",
            json={"transforms": transforms | {"y": "nope * y"}},
        ).get_json()
        assert check["errors"] == {"y": "Transform of 'y': Unknown name 'nope'"}
        assert check["ranges"]["x"] == {"from": [0, 10], "to": [0, 5]}
        assert check["ranges"]["t"]["to"] == [0, 100]

        timeline = client.post(
            f"/api/simulations/{sim}/timeline",
            json={"transforms": transforms, "previous": {"time": 0.51}},
        ).get_json()
        assert timeline["max"] == pytest.approx(100)
        assert timeline["current"] == pytest.approx(51.02041, rel=1e-4)

        line = client.post(
            f"/api/simulations/{sim}/render/line",
            json={
                "time": 51,
                "config": {"quantities": ["f"], "axis": "x"},
                "transforms": transforms,
            },
        ).get_json()
        assert line["timestamp"] == pytest.approx(51.02041, rel=1e-4)
        assert line["coordinates"][-1] == pytest.approx(5)

        meta = client.get(
            f"/api/simulations/{sim}/fields",
            query_string={"transforms": '{"x": "x * 2"}'},
        ).get_json()
        assert meta["coords"]["x"][-1] == pytest.approx(20)

        histogram = client.post(
            f"/api/simulations/{sim}/render/particles/histogram",
            json={
                "time": 100,
                "config": {
                    "x": {"quantity": "x", "scale": "linear"},
                    "series": [{"species": []}],
                },
                "transforms": transforms,
            },
        ).get_json()
        assert histogram["timestamp"] == pytest.approx(100)
        assert histogram["edges"][-1] <= 5 + 1e-6

    def test_new_simulations_get_the_transformed_timeline(self, client):
        put_state(client, coordinateTransforms={"t": "t * 100"})
        load_demo(client)
        timeline = client.get("/api/state").get_json()["state"]["timeline"]
        assert timeline["max"] == pytest.approx(100)
        # A transform that doesn't fit the run falls back to its own times.
        put_state(client, coordinateTransforms={"t": "t * setup.nope"})
        load_demo(client, "demo:other")
        assert client.get("/api/state").get_json()["state"]["timeline"]["max"] == 1
