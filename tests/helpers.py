"""Shared API test helpers (fixtures live in conftest.py)."""

DEMO_PATH = "demo:run1"


def put_state(client, revision=None, **overrides):
    """PUT the current state with `overrides`; `revision` defaults to the
    server's current one."""
    snapshot = client.get("/api/state").get_json()
    state = snapshot["state"] | overrides
    if revision is None:
        revision = snapshot["revision"]
    return client.put("/api/state", json={"revision": revision, "state": state})


def load_demo(client, path=DEMO_PATH):
    """Open a demo simulation; returns its id."""
    response = client.post("/api/simulations", json={"path": path})
    assert response.status_code == 200, response.get_json()
    return next(
        s["id"] for s in response.get_json()["simulations"] if s["path"] == path
    )
