import numpy as np
import pandas as pd
import pytest
import xarray as xr

from helpers import load_demo, put_state
from nt2gui.data.metadata import field_metadata
from nt2gui.data.particles import particle_dataset, required_columns
from nt2gui.data.quantities import quantity_dims, snapshot_at
from nt2gui.data.transforms import (
    Frame,
    TransformError,
    base_of,
    on_axes,
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
    def test_primed_coordinates_sit_next_to_the_originals(self, fields):
        frame = Frame({"x": "(x - grid.extent[0]) - setup.vel * t"}, ATTRS)
        snapshot, timestamp = snapshot_at(fields, 2.0, frame)
        assert timestamp == 2.0
        assert snapshot.x.values[0] == 2.0
        assert snapshot.xp.dims == ("x",)
        assert snapshot.xp.values[0] == pytest.approx(-1.0)
        assert snapshot.xp.values[-1] == pytest.approx(9.0)

    def test_time_axis_picks_and_reports_times(self, fields):
        frame = Frame({"t": "t * setup.omega"}, ATTRS, "tp")
        snapshot, timestamp = snapshot_at(fields, 9.0, frame)
        # 9 is nearest to 10 (= t 1 in original units).
        assert timestamp == 10.0
        assert snapshot.coords["t"].item() == 1.0
        assert snapshot.coords["tp"].item() == 10.0
        # On the original axis, times are the run's own.
        assert snapshot_at(fields, 2.0, Frame(frame.transforms, ATTRS))[1] == 2.0
        with pytest.raises(TransformError, match="needs a transform of t"):
            snapshot_at(fields, 0, Frame({}, ATTRS, "tp"))

    def test_axes_can_use_the_primed_coordinate(self, fields):
        snapshot, _ = snapshot_at(fields, 0, Frame({"x": "-x"}))
        data = on_axes(snapshot.f, ["xp"])
        assert data.dims == ("xp",)
        assert data.xp.values[0] == -12 and data.values[0] == 12
        assert on_axes(snapshot.f, ["x"]).x.values[0] == 2
        with pytest.raises(TransformError, match="same dimension"):
            on_axes(snapshot.f, ["x", "xp"])
        with pytest.raises(TransformError, match="needs a transform of y"):
            on_axes(snapshot_at(fields, 0)[0].f, ["yp"])
        assert base_of("thp") == "th" and base_of("w") == "w"

    @pytest.mark.parametrize(
        ("transforms", "message"),
        [
            ({"x": "x**2 - 50 + 0*x"}, None),
            ({"x": "(x - 7)**2"}, "increasing or decreasing"),
            ({"x": "setup.nope * x"}, "Unknown attribute 'setup.nope'"),
            ({"x": "grid.extent * x"}, "pick an element"),
            ({"x": "y + 1"}, "Unknown name 'y'"),
            ({"x": "3"}, "must depend on"),
        ],
    )
    def test_problems_are_named(self, fields, transforms, message):
        frame = Frame(transforms, ATTRS)
        if message is None:
            snapshot_at(fields, 0, frame)
            return
        with pytest.raises(TransformError, match=message):
            snapshot_at(fields, 0, frame)

    def test_decreasing_time_is_refused_on_its_axis(self, fields):
        with pytest.raises(TransformError, match="keep times increasing"):
            snapshot_at(fields, 0, Frame({"t": "-t"}, ATTRS, "tp"))

    def test_particles_get_primed_columns(self):
        frame = Frame({"x": "x / 2 + t"}, ATTRS)
        ds = particle_dataset(
            pd.DataFrame({"x": [2.0, 4.0], "ux": [1.0, 1.0], "w": 1.0, "sp": 1})
        )
        moved = frame.positions(ds, 1.0)
        assert moved.x.values.tolist() == [2.0, 4.0]
        assert moved.xp.values.tolist() == [2.0, 3.0]
        assert required_columns(
            ["xp * ux"], ["x", "ux", "w"], derived=frame.spatial
        ) == ["ux", "x", "w"]

    def test_definitions(self):
        assert transform_definitions({"x": " x/2 ", "y": ""}) == {"x": "x/2"}
        with pytest.raises(TransformError, match="Only x"):
            transform_definitions({"ux": "ux"})


class TestPlots:
    def test_line_along_either_coordinate(self, fields):
        frame = Frame({"x": "x / 2"}, ATTRS)
        line = render_line(
            fields, ["f"], "xp", {}, 0, {"min": 1, "max": 3}, frame=frame
        )
        assert line["axis"] == "xp"
        assert line["coordinates"][0] == pytest.approx(1.0)
        original = render_line(fields, ["f"], "x", {}, 0, frame=frame)
        assert original["coordinates"][0] == 2.0
        smoothed = render_line(
            fields, ["f"], "xp", {}, 0, smoothing={"xp": 1.5}, frame=frame
        )
        assert smoothed["smoothing"] == {"xp": 3}

    def test_metadata_and_expressions_see_both(self, fields):
        frame = Frame({"x": "x / 2"}, ATTRS)
        coords = field_metadata(fields, frame)["coords"]
        assert coords["x"][-1] == 12 and coords["xp"][-1] == pytest.approx(6.0)
        moving = Frame({"x": "x - t"}, ATTRS)
        assert field_metadata(fields, moving, 2.0)["coords"]["xp"][0] == 0.0
        assert quantity_dims("f * xp", fields, frame=frame) == ["x"]

    def test_pseudocolor_on_a_transformed_axis(self):
        ds = xr.Dataset(
            {"f": (("x", "y"), np.ones((4, 3)))},
            coords={"x": np.arange(4.0), "y": np.arange(3.0)},
        )
        image = render_pseudocolor(
            ds,
            PseudocolorConfig.model_validate({"field": "f", "yCoordinate": "yp"}),
            0,
            frame=Frame({"y": "10 * y"}),
        )
        assert image["extent"]["yMin"] == pytest.approx(-5)
        assert image["extent"]["yMax"] == pytest.approx(25)
        assert image["extent"]["xMax"] == pytest.approx(3.5)


def test_session_schema():
    wire = default_session().state.to_wire()
    state = UiState.model_validate(
        wire | {"coordinateTransforms": {"x": "x/2"}, "timeAxis": "tp"}
    )
    assert state.coordinate_transforms == {"x": "x/2"}
    with pytest.raises(ValueError):
        UiState.model_validate(wire | {"coordinateTransforms": {"ux": "ux"}})
    with pytest.raises(ValueError):
        UiState.model_validate(wire | {"timeAxis": "x"})


class TestApi:
    def test_renders_check_and_timeline(self, client):
        sim = load_demo(client)
        transforms = {"x": "(x - grid.extent[0]) / 2", "t": "t * 100"}
        check = client.post(
            f"/api/simulations/{sim}/transforms/check",
            json={"transforms": transforms | {"y": "nope * y"}},
        ).get_json()
        assert check["errors"] == {"y": "Transform of 'y': Unknown name 'nope'"}
        assert check["ranges"]["x"] == {"from": [0, 10], "to": [0, 5]}
        assert check["ranges"]["t"]["to"] == [0, 100]

        timeline = client.post(
            f"/api/simulations/{sim}/timeline",
            json={
                "transforms": transforms,
                "timeAxis": "tp",
                "previous": {"transforms": transforms, "time": 0.51},
            },
        ).get_json()
        assert timeline["max"] == pytest.approx(100)
        assert timeline["current"] == pytest.approx(51.02041, rel=1e-4)
        back = client.post(
            f"/api/simulations/{sim}/timeline",
            json={
                "transforms": transforms,
                "previous": {"transforms": transforms, "timeAxis": "tp", "time": 51},
            },
        ).get_json()
        assert back["max"] == 1 and back["current"] == pytest.approx(0.5102041)

        line = client.post(
            f"/api/simulations/{sim}/render/line",
            json={
                "time": 51,
                "config": {"quantities": ["f"], "axis": "xp"},
                "transforms": transforms,
                "timeAxis": "tp",
            },
        ).get_json()
        assert line["timestamp"] == pytest.approx(51.02041, rel=1e-4)
        assert line["coordinates"][-1] == pytest.approx(5)

        meta = client.get(
            f"/api/simulations/{sim}/fields",
            query_string={"transforms": '{"x": "x * 2"}'},
        ).get_json()
        assert meta["coords"]["x"][-1] == pytest.approx(10)
        assert meta["coords"]["xp"][-1] == pytest.approx(20)

        histogram = client.post(
            f"/api/simulations/{sim}/render/particles/histogram",
            json={
                "time": 1,
                "config": {
                    "x": {"quantity": "xp", "scale": "linear"},
                    "series": [{"species": []}],
                },
                "transforms": transforms,
            },
        ).get_json()
        assert histogram["timestamp"] == pytest.approx(1)
        assert histogram["edges"][-1] <= 5 + 1e-6
        assert (
            client.post(
                f"/api/simulations/{sim}/particles/check",
                json={"expression": "xp - x", "transforms": transforms},
            ).status_code
            == 200
        )

    def test_new_simulations_get_the_timeline_on_its_axis(self, client):
        put_state(client, coordinateTransforms={"t": "t * 100"}, timeAxis="tp")
        load_demo(client)
        timeline = client.get("/api/state").get_json()["state"]["timeline"]
        assert timeline["max"] == pytest.approx(100)
        # A transform that doesn't fit the run falls back to its own times.
        put_state(client, coordinateTransforms={"t": "t * setup.nope"})
        load_demo(client, "demo:other")
        assert client.get("/api/state").get_json()["state"]["timeline"]["max"] == 1
