import pytest

from nt2gui.app import create_app


@pytest.fixture
def state_file(tmp_path):
    return tmp_path / "session.json"


@pytest.fixture
def client(state_file):
    return create_app(state_file).test_client()


def put_state(client, revision, **overrides):
    state = client.get("/api/state").get_json()["state"]
    state.update(overrides)
    return client.put("/api/state", json={"revision": revision, "state": state})


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
    response = put_state(client, 0, globalViewport={"xMin": 0, "xMax": 1, "yMin": 0, "yMax": 1})

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
    plotters = {"p1": {"plotType": "pseudocolor", "dataType": "fields", "simulationId": sim_id}}
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

    assert first["simulations"] == [{"id": first["simulations"][0]["id"], "path": "demo:run1"}]
    assert first["state"]["timeline"]["max"] == 1.0
    assert second["revision"] == first["revision"]


def test_add_simulation_requires_path(client):
    assert client.post("/api/simulations", json={"path": "  "}).status_code == 400


def test_unloading_simulation_clears_references_and_resets_timeline(client):
    added = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()
    sim_id = added["simulations"][0]["id"]
    plotters = {"p1": {"plotType": "line", "dataType": "fields", "simulationId": sim_id}}
    put_state(client, added["revision"], plotters=plotters)

    response = client.delete(f"/api/simulations/{sim_id}")

    body = response.get_json()
    assert response.status_code == 200
    assert body["simulations"] == []
    assert body["state"]["plotters"]["p1"] == {"plotType": "line", "dataType": "fields"}
    assert body["state"]["timeline"] == {"current": 0, "min": 0, "max": 100, "step": 1}


def test_unknown_simulation_is_404(client):
    assert client.delete("/api/simulations/nope").status_code == 404
    assert client.post("/api/simulations/nope/render/pseudocolor", json={"time": 0}).status_code == 404


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

    ok = client.post(url, json={"config": config, "time": 0.5, "range": {"min": 2, "max": 4}})
    body = ok.get_json()
    assert ok.status_code == 200
    assert [s["name"] for s in body["series"]] == ["Ex", "Ey", "Ez", "N_1"]
    # One grid point beyond each edge of the zoom range is kept.
    inside = [c for c in body["coordinates"] if 2 <= c <= 4]
    assert len(body["coordinates"]) == len(inside) + 2

    unknown = client.post(url, json={"config": {**config, "quantities": ["zzz"]}, "time": 0})
    assert unknown.status_code == 400
    assert unknown.get_json()["error"] == "Unknown quantity 'zzz'"

    assert client.post(url, json={"config": config}).status_code == 400
    assert client.post(url, json={"config": {"axis": "x"}, "time": 0}).status_code == 400
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

    ok = client.post(url, json={"config": {"field": "f", "xCoordinate": "y", "yCoordinate": "x"}, "time": 0})
    missing = client.post(url, json={"config": {"field": "f", "xCoordinate": "x", "yCoordinate": "z"}, "time": 0})
    same = client.post(url, json={"config": {"field": "f", "xCoordinate": "x", "yCoordinate": "x"}, "time": 0})

    assert ok.status_code == 200
    assert missing.status_code == 400 and "does not depend on 'z'" in missing.get_json()["error"]
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
    two_d = client.post(url, json={"config": {**config, "field": "f"}, "time": 0}).get_json()

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


def load_sim(client):
    return client.post("/api/simulations", json={"path": "demo:run1"}).get_json()[
        "simulations"
    ][0]["id"]


def test_quantity_check_reports_dims_or_errors(client):
    url = f"/api/simulations/{load_sim(client)}/quantities/check"

    magnitude = client.post(url, json={"expression": " sqrt(Ex**2 + Ey**2 + Ez**2) "})
    assert magnitude.status_code == 200
    assert magnitude.get_json() == {
        "expression": "sqrt(Ex**2 + Ey**2 + Ez**2)",
        "dims": ["x", "y"],
    }
    assert client.post(url, json={"expression": "rho + f"}).get_json()["dims"] == [
        "x", "y", "z",
    ]
    assert client.post(url, json={"expression": "B"}).get_json()["dims"] == ["x", "y"]

    bad = client.post(url, json={"expression": "f + nope"})
    assert bad.status_code == 400
    assert bad.get_json()["error"] == "Unknown name 'nope'"
    assert client.post(url, json={"expression": ""}).status_code == 400
    assert client.post("/api/simulations/zzz/quantities/check", json={"expression": "f"}).status_code == 404


def test_expressions_render_in_1d_and_2d(client):
    sim_id = load_sim(client)

    line = client.post(
        f"/api/simulations/{sim_id}/render/line",
        json={"config": {"quantities": ["f + g", "N_1"], "axis": "x"}, "time": 0.2},
    ).get_json()
    assert [s["name"] for s in line["series"]] == ["f + g", "N_1"]

    pseudocolor = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={
            "config": {"field": "sqrt(Bx**2 + By**2)", "xCoordinate": "x", "yCoordinate": "y"},
            "time": 0.2,
        },
    )
    assert pseudocolor.status_code == 200

    vector = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={"config": {"field": "B", "xCoordinate": "x", "yCoordinate": "y"}, "time": 0},
    )
    assert vector.status_code == 400 and "is a vector" in vector.get_json()["error"]

    bad = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={"config": {"field": "f +", "xCoordinate": "x", "yCoordinate": "y"}, "time": 0},
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
    body = client.get(f"/api/simulations/{load_sim(client)}/particles").get_json()

    assert [s["index"] for s in body["species"]] == [1, 2, 3]
    assert {"name": "energy", "defaultScale": "log"} in body["quantities"]
    assert {"name": "ux", "defaultScale": "linear"} in body["quantities"]
    assert client.get("/api/simulations/nope/particles").status_code == 404


def test_particle_expression_check(client):
    url = f"/api/simulations/{load_sim(client)}/particles/check"
    assert client.post(url, json={"expression": "gamma * w"}).status_code == 200
    bad = client.post(url, json={"expression": "Bx"})
    assert bad.status_code == 400 and "Unknown name 'Bx'" in bad.get_json()["error"]


def test_particle_histogram_endpoint(client):
    url = f"/api/simulations/{load_sim(client)}/render/particles/histogram"
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
    bad = client.post(url, json={"config": {**config, "x": axis("energy", "cubic")}, "time": 0})
    assert bad.status_code == 400
    assert client.post(url, json={"config": config}).status_code == 400


def test_particle_phase_endpoint(client):
    url = f"/api/simulations/{load_sim(client)}/render/particles/phase"
    config = {"x": axis("x", bins=64), "y": axis("ux", "power", power=0.5, bins=32), "species": [1]}

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
