import pytest

from index import create_app


@pytest.fixture
def state_file(tmp_path):
    return tmp_path / "session.json"


@pytest.fixture
def client(state_file):
    return create_app(state_file).test_client()


def put_state(client, revision, **overrides):
    state = client.get("/state").get_json()["state"]
    state.update(overrides)
    return client.put("/state", json={"revision": revision, "state": state})


def test_state_is_available_without_initialization(client):
    response = client.get("/state")

    assert response.status_code == 200
    body = response.get_json()
    assert body["revision"] == 0
    assert set(body["state"]) == {"layout", "plotters", "timeline", "globalViewport"}


def test_put_state_accepts_current_revision(client):
    response = put_state(client, 0, globalViewport={"xMin": 0, "xMax": 1, "yMin": 0, "yMax": 1})

    assert response.status_code == 200
    assert response.get_json()["revision"] == 1
    assert client.get("/state").get_json()["state"]["globalViewport"]["xMax"] == 1


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
    response = client.put("/state", json=payload)

    assert response.status_code == 400
    assert client.get("/state").get_json()["revision"] == 0


def test_put_state_rejects_unknown_plotter_fields(client):
    plotters = {"p1": {"plotType": "line", "dataType": "fields", "typo": 1}}

    response = put_state(client, 0, plotters=plotters)

    assert response.status_code == 400


def test_state_and_simulations_survive_restart(state_file):
    client = create_app(state_file).test_client()
    added = client.post("/simulations", json={"path": "/data/run1"}).get_json()
    sim_id = added["simulations"][0]["id"]
    plotters = {"p1": {"plotType": "pseudocolor", "dataType": "fields", "simulationId": sim_id}}
    put_state(client, added["revision"], plotters=plotters)
    before = client.get("/state").get_json()

    restarted = create_app(state_file).test_client()

    assert restarted.get("/state").get_json() == before
    render = restarted.post(
        f"/simulations/{sim_id}/render/pseudocolor",
        json={"config": {"field": "f"}, "time": 0},
    )
    assert render.status_code == 200


def test_adding_simulation_sets_timeline_and_is_idempotent(client):
    first = client.post("/simulations", json={"path": " /data/run1 "}).get_json()
    second = client.post("/simulations", json={"path": "/data/run1"}).get_json()

    assert first["simulations"] == [{"id": first["simulations"][0]["id"], "path": "/data/run1"}]
    assert first["state"]["timeline"]["max"] == 1.0
    assert second["revision"] == first["revision"]


def test_add_simulation_requires_path(client):
    assert client.post("/simulations", json={"path": "  "}).status_code == 400


def test_unloading_simulation_clears_references_and_resets_timeline(client):
    added = client.post("/simulations", json={"path": "/data/run1"}).get_json()
    sim_id = added["simulations"][0]["id"]
    plotters = {"p1": {"plotType": "line", "dataType": "fields", "simulationId": sim_id}}
    put_state(client, added["revision"], plotters=plotters)

    response = client.delete(f"/simulations/{sim_id}")

    body = response.get_json()
    assert response.status_code == 200
    assert body["simulations"] == []
    assert body["state"]["plotters"]["p1"] == {"plotType": "line", "dataType": "fields"}
    assert body["state"]["timeline"] == {"current": 0, "min": 0, "max": 100, "step": 1}


def test_unknown_simulation_is_404(client):
    assert client.delete("/simulations/nope").status_code == 404
    assert client.post("/simulations/nope/render/pseudocolor", json={"time": 0}).status_code == 404
