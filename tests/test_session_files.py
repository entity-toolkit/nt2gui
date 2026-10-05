import pytest

from helpers import put_state

VIEWPORT = {"xMin": 1, "xMax": 2, "yMin": 3, "yMax": 4}


def test_save_then_load_on_server_restores_state_and_simulations(client, tmp_path):
    sim = client.post("/api/simulations", json={"path": "demo:run1"}).get_json()
    sim_id = sim["simulations"][0]["id"]
    plotters = {
        "p1": {"plotType": "pseudocolor", "dataType": "fields", "simulationId": sim_id}
    }
    saved_state = put_state(
        client, plotters=plotters, globalViewport=VIEWPORT
    ).get_json()["state"]
    target = tmp_path / "saves" / "mine.json"

    saved = client.post("/api/session/save", json={"path": str(target)})
    assert saved.status_code == 200
    assert saved.get_json()["path"] == str(target)
    assert target.exists()

    # Change everything, then load the saved file back.
    client.delete(f"/api/simulations/{sim_id}")
    put_state(client, globalViewport=None)
    revision_before = client.get("/api/state").get_json()["revision"]

    loaded = client.post("/api/session/load", json={"path": str(target)})

    body = loaded.get_json()
    assert loaded.status_code == 200
    assert body["state"] == saved_state
    assert body["simulations"] == [{"id": sim_id, "path": "demo:run1", "name": "run1"}]
    assert body["warnings"] == []
    assert body["revision"] == revision_before + 1
    # The simulation is live again under the same id.
    render = client.post(
        f"/api/simulations/{sim_id}/render/pseudocolor",
        json={"config": {"field": "f"}, "time": 0},
    )
    assert render.status_code == 200


def test_save_refuses_to_overwrite_unless_asked(client, tmp_path):
    target = tmp_path / "s.json"
    target.write_text("keep me")

    refused = client.post("/api/session/save", json={"path": str(target)})
    assert refused.status_code == 409
    assert refused.get_json()["path"] == str(target)
    assert target.read_text() == "keep me"

    forced = client.post(
        "/api/session/save", json={"path": str(target), "overwrite": True}
    )
    assert forced.status_code == 200
    assert target.read_text() != "keep me"


def test_save_appends_json_suffix_and_rejects_other_suffixes(client, tmp_path):
    saved = client.post("/api/session/save", json={"path": str(tmp_path / "noext")})
    assert saved.get_json()["path"] == str(tmp_path / "noext.json")

    rejected = client.post(
        "/api/session/save", json={"path": str(tmp_path / "evil.py")}
    )
    assert rejected.status_code == 400
    assert not (tmp_path / "evil.py").exists()


@pytest.mark.parametrize("payload", [{}, {"path": ""}, {"path": 5}])
def test_save_and_load_require_a_path(client, payload):
    assert client.post("/api/session/save", json=payload).status_code == 400
    assert client.post("/api/session/load", json=payload).status_code == 400


def test_save_into_a_directory_path_fails_cleanly(client, tmp_path):
    (tmp_path / "dir.json").mkdir()
    assert (
        client.post(
            "/api/session/save", json={"path": str(tmp_path / "dir.json")}
        ).status_code
        == 400
    )


def test_load_missing_file_is_404(client, tmp_path):
    response = client.post(
        "/api/session/load", json={"path": str(tmp_path / "nope.json")}
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "content",
    ["{not json", "[]", '{"state": {}}', '{"schemaVersion": 999, "state": {}}'],
)
def test_load_invalid_file_leaves_session_untouched(client, tmp_path, content):
    before = client.get("/api/state").get_json()
    target = tmp_path / "bad.json"
    target.write_text(content)

    response = client.post("/api/session/load", json={"path": str(target)})

    assert response.status_code == 400
    assert client.get("/api/state").get_json() == before


def test_export_then_import_round_trips(client):
    client.post("/api/simulations", json={"path": "demo:run1"})
    put_state(client, globalViewport=VIEWPORT)
    exported = client.get("/api/session/export").get_json()
    assert set(exported) == {"schemaVersion", "state", "simulations"}

    put_state(client, globalViewport=None)
    imported = client.post("/api/session/import", json={"session": exported}).get_json()

    assert imported["state"] == exported["state"]
    assert imported["simulations"] == exported["simulations"]


def test_import_accepts_a_raw_server_session_file(client, tmp_path):
    put_state(client, globalViewport=VIEWPORT)
    session_file = (tmp_path / "state" / "session.json").read_text()
    put_state(client, globalViewport=None)

    import json

    imported = client.post(
        "/api/session/import", json={"session": json.loads(session_file)}
    )

    assert imported.status_code == 200
    assert imported.get_json()["state"]["globalViewport"] == VIEWPORT


def test_import_rejects_garbage(client):
    assert (
        client.post("/api/session/import", json={"session": "hello"}).status_code == 400
    )
    assert client.post("/api/session/import", json={}).status_code == 400


def test_stale_client_gets_conflict_after_a_load(client, tmp_path):
    target = tmp_path / "s.json"
    client.post("/api/session/save", json={"path": str(target)})
    stale = client.get("/api/state").get_json()

    client.post("/api/session/load", json={"path": str(target)})
    response = client.put(
        "/api/state", json={"revision": stale["revision"], "state": stale["state"]}
    )

    assert response.status_code == 409


def test_simulations_that_fail_to_open_are_dropped_with_a_warning(client, tmp_path):
    document = client.get("/api/session/export").get_json()
    missing = str(tmp_path / "moved" / "away")
    document["simulations"] = [{"id": "gone", "path": missing}]
    document["state"]["plotters"] = {
        "p1": {"plotType": "line", "dataType": "fields", "simulationId": "gone"}
    }

    body = client.post("/api/session/import", json={"session": document}).get_json()

    assert body["simulations"] == []
    assert body["state"]["plotters"]["p1"] == {"plotType": "line", "dataType": "fields"}
    assert len(body["warnings"]) == 1
    assert missing in body["warnings"][0] and "No such directory" in body["warnings"][0]
