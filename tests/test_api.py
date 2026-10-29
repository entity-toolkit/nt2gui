import json

import numpy as np
import pytest

from helpers import load_demo, put_state
from nt2gui import workspace as workspace_module
from nt2gui.app import create_app
from nt2gui.sources import open_simulation
from nt2gui.sources.demo import DemoSimulation


def test_state_is_available_without_initialization(client):
    response = client.get("/api/state")

    assert response.status_code == 200
    body = response.get_json()
    assert body["revision"] == 0
    assert set(body["state"]) == {
        "layout",
        "plotters",
        "timeline",
        "globalViewport",
        "globalLineViewports",
    }


def test_put_state_accepts_current_revision(client):
    response = put_state(
        client, 0, globalViewport={"xMin": 0, "xMax": 1, "yMin": 0, "yMax": 1}
    )

    assert response.status_code == 200
    assert response.get_json()["revision"] == 1
    assert client.get("/api/state").get_json()["state"]["globalViewport"]["xMax"] == 1


def test_put_state_with_stale_revision_returns_conflict_and_current_state(client):
    put_state(client, 0)

    response = put_state(client, 0)

    assert response.status_code == 409
    body = response.get_json()
    assert body["revision"] == 1
    assert "state" in body and "simulations" in body


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"state": {}},
        {"revision": "1", "state": {}},
        {"revision": 0, "state": {"layout": {}}},
    ],
)
def test_put_state_rejects_malformed_payloads(client, payload):
    response = client.put("/api/state", json=payload)

    assert response.status_code == 400
    assert client.get("/api/state").get_json()["revision"] == 0


def test_put_state_rejects_unknown_plotter_fields(client):
    plotters = {"p1": {"plotType": "line", "dataType": "fields", "typo": 1}}

    response = put_state(client, 0, plotters=plotters)

    assert response.status_code == 400


def test_state_and_simulations_survive_restart(state_file):
    client = create_app(state_file).test_client()
    added = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()
    sim_id = added["simulations"][0]["id"]
    plotters = {
        "p1": {"plotType": "pseudocolor", "dataType": "fields", "simulationId": sim_id}
    }
    put_state(client, added["revision"], plotters=plotters)
    before = client.get("/api/state").get_json()

    restarted = create_app(state_file).test_client()

    assert restarted.get("/api/state").get_json() == before
    render = restarted.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={"config": {"field": "f"}, "time": 0},
    )
    assert render.status_code == 200


def test_adding_simulation_sets_timeline_and_is_idempotent(client):
    first = client.post("/api/simulations", json={"path": " demo:run1 "}).get_json()
    second = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()

    assert first["simulations"] == [
        {"id": first["simulations"][0]["id"], "path": "demo:run1", "name": "run1"}
    ]
    assert first["state"]["timeline"]["max"] == 1.0
    assert second["revision"] == first["revision"]


class _LongerDemo(DemoSimulation):
    """A demo run that goes on twice as long (t in [0, 2])."""

    def __init__(self, path, simulation_id=None):
        super().__init__(path, simulation_id)
        self._t = self._t * 2
        self._fields = self._fields.assign_coords(t=self._t)


@pytest.fixture
def longer_runs(monkeypatch):
    """`demo:long…` paths open a run twice as long as the others."""

    def opener(path, simulation_id=None):
        if path.startswith("demo:long"):
            return _LongerDemo(path, simulation_id)
        return open_simulation(path, simulation_id)

    monkeypatch.setattr(workspace_module, "open_simulation", opener)


def test_global_timeline_spans_every_simulation(client, longer_runs):
    load_demo(client, "demo:short")
    revision = client.get("/api/state").get_json()["revision"]
    put_state(client, revision, timeline={"current": 0.5, "min": 0, "max": 1, "step": 0.1})
    long = load_demo(client, "demo:long")

    timeline = client.get("/api/state").get_json()["state"]["timeline"]
    assert timeline["min"] == 0 and timeline["max"] == 2
    # The current time stays; the finest step wins.
    assert timeline["current"] == 0.5
    assert timeline["step"] == pytest.approx(1 / 49)

    # Back to the shorter run's span (the current time is kept inside it).
    revision = client.get("/api/state").get_json()["revision"]
    put_state(client, revision, timeline=timeline | {"current": 1.8})
    remaining = client.delete(f"/api/simulations/{long}").get_json()
    assert remaining["state"]["timeline"]["max"] == 1
    assert remaining["state"]["timeline"]["current"] == 1


def test_simulation_span_is_on_the_timeline_axis(client, longer_runs):
    long = load_demo(client, "demo:long")
    assert client.get(f"/api/simulations/{long}/span").get_json() == {"min": 0, "max": 2}
    query = "transforms=" + json.dumps({"t": "t * 10"}) + "&timeAxis=tp"
    span = client.get(f"/api/simulations/{long}/span?{query}").get_json()
    assert span == {"min": 0, "max": 20}
    assert client.get(f"/api/simulations/{long}/span?transforms=x").status_code == 400


def test_transformed_timeline_spans_every_simulation(client, longer_runs):
    short = load_demo(client, "demo:short")
    load_demo(client, "demo:long")
    timeline = client.post(
        f"/api/simulations/{short}/timeline",
        json={
            "transforms": {"t": "t * 10"},
            "timeAxis": "tp",
            "previous": {"time": 0.5},
        },
    ).get_json()
    assert timeline["max"] == pytest.approx(20)
    # At the short run's output nearest to 0.5.
    assert timeline["current"] == pytest.approx(10 * 24 / 49)


def test_simulations_are_named_after_their_run_uniquely(client):
    first = load_demo(client, "demo:a")
    client.patch(f"/api/simulations/{first}", json={"name": "c"})
    # A run whose own name ("c") is taken gets a numbered one.
    load_demo(client, "demo:c")
    simulations = client.get("/api/state").get_json()["simulations"]
    assert [s["name"] for s in simulations] == ["c", "c-01"]


def test_duplicate_run_names_get_numbered():
    from nt2gui.workspace import unique_name

    assert unique_name("run", set()) == "run"
    assert unique_name("run", {"run"}) == "run-01"
    assert unique_name("run", {"run", "run-01", "run-02"}) == "run-03"


def test_renaming_a_simulation(client):
    first = load_demo(client, "demo:a")
    load_demo(client, "demo:b")
    url = f"/api/simulations/{first}"

    renamed = client.patch(url, json={"name": "  shock run "})
    assert renamed.status_code == 200
    assert renamed.get_json()["simulations"][0]["name"] == "shock run"

    taken = client.patch(url, json={"name": "b"})
    assert taken.status_code == 409
    assert "already called 'b'" in taken.get_json()["error"]
    assert client.patch(url, json={"name": " "}).status_code == 400
    assert client.patch(url, json={"name": "x" * 101}).status_code == 400
    assert client.patch("/api/simulations/nope", json={"name": "c"}).status_code == 404
    # Keeping its own name is fine.
    assert client.patch(url, json={"name": "shock run"}).status_code == 200


def test_unnamed_simulations_of_old_sessions_get_names(state_file):
    import json

    client = create_app(state_file).test_client()
    load_demo(client, "demo:run")
    load_demo(client, "demo:run2")
    saved = json.loads(state_file.read_text())
    for record in saved["simulations"]:
        del record["name"]
    saved["simulations"][1]["path"] = "demo:run"  # two runs with the same name
    state_file.write_text(json.dumps(saved))

    restarted = create_app(state_file).test_client()
    names = [s["name"] for s in restarted.get("/api/state").get_json()["simulations"]]
    assert names == ["run", "run-01"]


def test_add_simulation_requires_path(client):
    assert client.post("/api/simulations", json={"path": "  "}).status_code == 400


def test_unloading_simulation_clears_references_and_resets_timeline(client):
    added = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()
    sim_id = added["simulations"][0]["id"]
    plotters = {
        "p1": {"plotType": "line", "dataType": "fields", "simulationId": sim_id}
    }
    put_state(client, added["revision"], plotters=plotters)

    response = client.delete(f"/api/simulations/{sim_id}")

    body = response.get_json()
    assert response.status_code == 200
    assert body["simulations"] == []
    assert body["state"]["plotters"]["p1"] == {"plotType": "line", "dataType": "fields"}
    assert body["state"]["timeline"] == {"current": 0, "min": 0, "max": 100, "step": 1}


def test_unknown_simulation_is_404(client):
    assert client.delete("/api/simulations/nope").status_code == 404
    assert (
        client.post(
            "/api/simulations/nope/render/pseudocolor", json={"time": 0}
        ).status_code
        == 404
    )


def test_field_metadata_endpoint(client):
    sim_id = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()[
        "simulations"
    ][0]["id"]

    body = client.get(f"/api/simulations/{sim_id}/fields").get_json()

    assert {"name": "B", "components": ["Bx", "By", "Bz"]} in body["vectors"]
    assert {"name": "N_1", "dims": ["x", "y"]} in body["fields"]
    assert client.get("/api/simulations/nope/fields").status_code == 404


def test_line_render_endpoint(client):
    sim_id = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()[
        "simulations"
    ][0]["id"]
    url = f"/api/simulations/{sim_id}/render/line"
    config = {"quantities": ["E", "N_1"], "axis": "x", "slices": {"y": 0.0}}

    ok = client.post(
        url, json={"config": config, "time": 0.5, "range": {"min": 2, "max": 4}}
    )
    body = ok.get_json()
    assert ok.status_code == 200
    assert [s["name"] for s in body["series"]] == ["Ex", "Ey", "Ez", "N_1"]
    # One grid point beyond each edge of the zoom range is kept.
    inside = [c for c in body["coordinates"] if 2 <= c <= 4]
    assert len(body["coordinates"]) == len(inside) + 2

    unknown = client.post(
        url, json={"config": {**config, "quantities": ["zzz"]}, "time": 0}
    )
    assert unknown.status_code == 400
    assert unknown.get_json()["error"] == "Unknown quantity 'zzz'"

    assert client.post(url, json={"config": config}).status_code == 400
    assert (
        client.post(url, json={"config": {"axis": "x"}, "time": 0}).status_code == 400
    )
    bad_range = {"config": config, "time": 0, "range": {"min": 3, "max": 1}}
    assert client.post(url, json=bad_range).status_code == 400


def test_line_plot_state_round_trips(client):
    plotters = {
        "p1": {
            "plotType": "line",
            "dataType": "fields",
            "lineConfig": {"quantities": ["B"], "axis": "y", "slices": {"x": 2.5}},
            "lineViewport": {"min": -1, "max": 1},
        }
    }
    response = put_state(
        client, 0, plotters=plotters, globalLineViewports={"x": {"min": 0, "max": 5}}
    )

    assert response.status_code == 200
    state = client.get("/api/state").get_json()["state"]
    assert state["plotters"] == plotters
    assert state["globalLineViewports"] == {"x": {"min": 0, "max": 5}}


def test_line_y_limits_round_trip_in_state(client):
    plotters = {
        "p1": {
            "plotType": "line",
            "dataType": "fields",
            "lineConfig": {"quantities": ["f"], "axis": "x", "yMin": -2, "yMax": 3.5},
        }
    }
    assert put_state(client, 0, plotters=plotters).status_code == 200
    assert client.get("/api/state").get_json()["state"]["plotters"] == plotters


def test_pseudocolor_rejects_axes_the_field_lacks(client):
    sim_id = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()[
        "simulations"
    ][0]["id"]
    url = f"/api/simulations/{sim_id}/render/pseudocolor"

    ok = client.post(
        url,
        json={
            "config": {"field": "f", "xCoordinate": "y", "yCoordinate": "x"},
            "time": 0,
        },
    )
    missing = client.post(
        url,
        json={
            "config": {"field": "f", "xCoordinate": "x", "yCoordinate": "z"},
            "time": 0,
        },
    )
    same = client.post(
        url,
        json={
            "config": {"field": "f", "xCoordinate": "x", "yCoordinate": "x"},
            "time": 0,
        },
    )

    assert ok.status_code == 200
    assert (
        missing.status_code == 400
        and "does not depend on 'z'" in missing.get_json()["error"]
    )
    assert same.status_code == 400


def test_pseudocolor_of_3d_field_is_sliced_at_requested_coordinate(client):
    sim_id = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()[
        "simulations"
    ][0]["id"]
    url = f"/api/simulations/{sim_id}/render/pseudocolor"
    config = {"field": "rho", "xCoordinate": "x", "yCoordinate": "y"}

    middle = client.post(url, json={"config": config, "time": 0}).get_json()
    chosen = client.post(
        url, json={"config": {**config, "slices": {"z": 1.4}}, "time": 0}
    ).get_json()
    along_z = client.post(
        url,
        json={"config": {**config, "yCoordinate": "z", "slices": {"y": -5}}, "time": 0},
    ).get_json()
    two_d = client.post(
        url, json={"config": {**config, "field": "f"}, "time": 0}
    ).get_json()

    assert middle["slices"] == {"z": 0.0}
    assert chosen["slices"] == {"z": 1.5}  # nearest grid point (z step is 0.5)
    # rho ~ exp(-z^2): a slice away from z=0 has a smaller peak.
    assert chosen["colorbar"]["vmax"] < middle["colorbar"]["vmax"]
    assert along_z["slices"] == {"y": -5.0}
    assert two_d["slices"] == {}


def test_pseudocolor_slices_round_trip_in_state(client):
    plotters = {
        "p1": {
            "plotType": "pseudocolor",
            "dataType": "fields",
            "pseudocolorConfig": {
                "field": "rho",
                "xCoordinate": "x",
                "yCoordinate": "y",
                "colorMap": "viridis",
                "slices": {"z": 0.5},
            },
        }
    }
    assert put_state(client, 0, plotters=plotters).status_code == 200
    assert client.get("/api/state").get_json()["state"]["plotters"] == plotters


def test_quantity_check_reports_dims_or_errors(client):
    url = f"/api/simulations/{load_demo(client)}/quantities/check"

    magnitude = client.post(url, json={"expression": " sqrt(Ex**2 + Ey**2 + Ez**2) "})
    assert magnitude.status_code == 200
    assert magnitude.get_json() == {
        "expression": "sqrt(Ex**2 + Ey**2 + Ez**2)",
        "dims": ["x", "y"],
    }
    assert client.post(url, json={"expression": "rho + f"}).get_json()["dims"] == [
        "x",
        "y",
        "z",
    ]
    assert client.post(url, json={"expression": "B"}).get_json()["dims"] == ["x", "y"]

    bad = client.post(url, json={"expression": "f + nope"})
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "Unknown name 'nope'"
    assert client.post(url, json={"expression": ""}).status_code == 400
    assert (
        client.post(
            "/api/simulations/zzz/quantities/check", json={"expression": "f"}
        ).status_code
        == 404
    )


def test_expressions_render_in_1d_and_2d(client):
    sim_id = load_demo(client)

    line = client.post(
        f"/api/simulations/{sim_id}/render/line",
        json={"config": {"quantities": ["f + g", "N_1"], "axis": "x"}, "time": 0.2},
    ).get_json()
    assert [s["name"] for s in line["series"]] == ["f + g", "N_1"]

    pseudocolor = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={
            "config": {
                "field": "sqrt(Bx**2 + By**2)",
                "xCoordinate": "x",
                "yCoordinate": "y",
            },
            "time": 0.2,
        },
    )
    assert pseudocolor.status_code == 200

    vector = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={
            "config": {"field": "B", "xCoordinate": "x", "yCoordinate": "y"},
            "time": 0,
        },
    )
    assert vector.status_code == 400 and "is a vector" in vector.get_json()["error"]

    bad = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={
            "config": {"field": "f +", "xCoordinate": "x", "yCoordinate": "y"},
            "time": 0,
        },
    )
    assert bad.status_code == 400 and "Invalid expression" in bad.get_json()["error"]


def test_custom_expressions_round_trip_in_state(client):
    plotters = {
        "p1": {
            "plotType": "line",
            "dataType": "fields",
            "lineConfig": {
                "quantities": ["f + g"],
                "axis": "x",
                "expressions": ["f + g", "sqrt(Ex**2 + Ey**2)"],
            },
        },
        "p2": {
            "plotType": "pseudocolor",
            "dataType": "fields",
            "pseudocolorConfig": {
                "field": "log10(N_1)",
                "xCoordinate": "x",
                "yCoordinate": "y",
                "colorMap": "viridis",
                "expressions": ["log10(N_1)"],
            },
        },
    }
    assert put_state(client, 0, plotters=plotters).status_code == 200
    assert client.get("/api/state").get_json()["state"]["plotters"] == plotters


def axis(quantity, scale="linear", **extra):
    return {"quantity": quantity, "scale": scale, **extra}


def test_particle_metadata(client):
    body = client.get(f"/api/simulations/{load_demo(client)}/particles").get_json()

    assert [s["index"] for s in body["species"]] == [1, 2, 3]
    assert {"name": "energy", "defaultScale": "log"} in body["quantities"]
    assert {"name": "ux", "defaultScale": "linear"} in body["quantities"]
    assert client.get("/api/simulations/nope/particles").status_code == 404


def test_particle_expression_check(client):
    url = f"/api/simulations/{load_demo(client)}/particles/check"
    assert client.post(url, json={"expression": "gamma * w"}).status_code == 200
    bad = client.post(url, json={"expression": "Bx"})
    assert bad.status_code == 400 and "Unknown name 'Bx'" in bad.get_json()["error"]


def test_particle_histogram_endpoint(client):
    url = f"/api/simulations/{load_demo(client)}/render/particles/histogram"
    config = {
        "x": axis("energy", "log", bins=40),
        "series": [{"species": [1]}, {"species": [3]}],
    }

    body = client.post(url, json={"config": config, "time": 0.3}).get_json()
    assert len(body["edges"]) == 41
    assert [len(s["counts"]) for s in body["series"]] == [40, 40]
    assert body["timestamp"] == pytest.approx(0.3, abs=0.02)

    custom = {**config, "x": axis("ux * w", "power", power=0.3)}
    assert client.post(url, json={"config": custom, "time": 0}).status_code == 200
    bad = client.post(
        url, json={"config": {**config, "x": axis("energy", "cubic")}, "time": 0}
    )
    assert bad.status_code == 400
    assert client.post(url, json={"config": config}).status_code == 400


LEFT_HALF = {"name": "region-01", "ranges": {"x": {"min": -1e9, "max": 0}}}


def test_particle_plots_filter_by_regions(client):
    sim_id = load_demo(client)
    histogram_url = f"/api/simulations/{sim_id}/render/particles/histogram"
    # Fixed bins, and a region covering their lower half.
    config = {
        "x": axis("x", bins=10, min=0, max=1),
        "series": [{"species": []}, {"species": [], "regions": ["lower"]}],
    }
    lower = {"name": "lower", "ranges": {"x": {"min": 0, "max": 0.5}}}
    body = client.post(
        histogram_url, json={"config": config, "time": 0, "regions": [lower]}
    ).get_json()
    everything, inside = (np.array(s["counts"]) for s in body["series"])
    assert everything[5:].sum() > 0
    assert inside[5:].sum() == 0
    np.testing.assert_allclose(inside[:5], everything[:5])

    phase_url = f"/api/simulations/{sim_id}/render/particles/phase"
    phase = {"x": axis("x"), "y": axis("ux"), "regions": ["lower"]}
    body = client.post(
        phase_url, json={"config": phase, "time": 0, "regions": [lower]}
    ).get_json()
    assert body["extent"]["xMax"] <= 0.5

    # A region the request doesn't define, or a malformed one, is a 400.
    missing = client.post(phase_url, json={"config": phase, "time": 0})
    assert missing.status_code == 400
    assert "Unknown region 'lower'" in missing.get_json()["error"]
    bad = client.post(
        phase_url,
        json={"config": phase, "time": 0, "regions": [{"name": "lower"}]},
    )
    assert bad.status_code == 400


def test_regions_round_trip_and_need_unique_names(client):
    lasso = {
        "name": "region-02",
        "polygon": {"x": "x", "y": "y", "points": [[0, 0], [1, 0], [0, 1]]},
    }
    assert put_state(client, regions=[LEFT_HALF, lasso]).status_code == 200
    state = client.get("/api/state").get_json()["state"]
    assert state["regions"][1]["polygon"]["points"] == [[0, 0], [1, 0], [0, 1]]
    assert put_state(client, regions=[LEFT_HALF, LEFT_HALF]).status_code == 400


def test_particle_phase_endpoint(client):
    url = f"/api/simulations/{load_demo(client)}/render/particles/phase"
    config = {
        "x": axis("x", bins=64),
        "y": axis("ux", "power", power=0.5, bins=32),
        "species": [1],
    }

    body = client.post(url, json={"config": config, "time": 0}).get_json()
    assert body["imageSize"] == {"width": 64, "height": 32}
    assert body["extent"]["yMin"] < 0 < body["extent"]["yMax"]
    assert body["colorbar"]["scale"] == "log"

    bad = client.post(url, json={"config": {**config, "colorMap": "nope"}, "time": 0})
    assert bad.status_code == 400 and "colormap" in bad.get_json()["error"]


def test_particle_plot_configs_round_trip_in_state(client):
    plotters = {
        "p1": {
            "plotType": "line",
            "dataType": "particles",
            "particleHistogramConfig": {
                "x": axis("gamma", "log", bins=80, min=1),
                "series": [{"species": [1]}, {"species": []}],
                "yScale": "linear",
                "expressions": ["gamma - 1"],
            },
        },
        "p2": {
            "plotType": "pseudocolor",
            "dataType": "particles",
            "particlePhaseConfig": {
                "x": axis("x"),
                "y": axis("ux", "power", power=0.25),
                "species": [2, 3],
                "colorScale": "linear",
            },
        },
    }
    assert put_state(client, 0, plotters=plotters).status_code == 200
    assert client.get("/api/state").get_json()["state"]["plotters"] == plotters


def test_unreadable_simulation_path_is_a_clear_error(client, tmp_path):
    response = client.post("/api/simulations", json={"path": str(tmp_path / "nope")})

    assert response.status_code == 400
    assert "No such directory" in response.get_json()["error"]
    assert client.get("/api/state").get_json()["simulations"] == []


def test_sidebar_state_round_trips(client):
    assert put_state(client, sidebarCollapsed=True).status_code == 200
    assert client.get("/api/state").get_json()["state"]["sidebarCollapsed"] is True



def test_playback_settings_round_trip(client):
    assert (
        put_state(client, timelineCollapsed=True, playbackFps=30).status_code == 200
    )
    state = client.get("/api/state").get_json()["state"]
    assert state["timelineCollapsed"] is True
    assert state["playbackFps"] == 30


@pytest.mark.parametrize("fps", [0, -1, 61])
def test_playback_fps_out_of_range_is_rejected(client, fps):
    assert put_state(client, playbackFps=fps).status_code == 400
    plotters = {
        "p": {
            "plotType": "none",
            "dataType": "none",
            "syncTime": False,
            "localPlaybackFps": fps,
        }
    }
    assert put_state(client, plotters=plotters).status_code == 400


def test_panel_local_time_round_trips(client):
    plotters = {
        "p": {
            "plotType": "line",
            "dataType": "fields",
            "syncTime": False,
            "localTime": 3.5,
            "localPlaybackFps": 10,
        }
    }
    assert put_state(client, plotters=plotters).status_code == 200
    assert client.get("/api/state").get_json()["state"]["plotters"] == plotters

@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("post", "/api/simulations", [1]),
        ("put", "/api/state", "text"),
        ("post", "/api/session/load", [None]),
    ],
)
def test_non_object_bodies_are_rejected(client, method, url, body):
    response = getattr(client, method)(url, json=body)
    assert response.status_code == 400
    assert response.get_json()["error"] == "Expected a JSON object"


@pytest.mark.parametrize("time", [True, "0", None])
def test_times_must_be_numbers(client, time):
    sim_id = load_demo(client)
    for url, config in [
        ("render/line", {"quantities": ["f"], "axis": "x"}),
        ("render/pseudocolor", {"field": "f"}),
        (
            "render/particles/histogram",
            {"x": {"quantity": "x", "scale": "linear"}, "series": [{}]},
        ),
    ]:
        response = client.post(
            f"/api/simulations/{sim_id}/{url}", json={"config": config, "time": time}
        )
        assert response.status_code == 400, url
        assert response.get_json()["error"] == "Time value is required"


def test_missing_config_is_a_validation_error(client):
    sim_id = load_demo(client)
    response = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={"config": None, "time": 0},
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid pseudocolor request"


def test_missing_session_path_is_reported_as_such(client):
    response = client.post("/api/session/load", json={})
    assert response.status_code == 400
    assert response.get_json()["error"] == "A session file path is required"


def test_slow_requests_are_logged(client, monkeypatch, caplog):
    import nt2gui.app as app_module

    monkeypatch.setattr(app_module, "SLOW_REQUEST_SECONDS", -1)
    with caplog.at_level("INFO"):
        client.get("/api/state")
    assert any("slow request: GET /api/state took" in r.message for r in caplog.records)
