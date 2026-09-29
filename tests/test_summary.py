import numpy as np
import pytest
import xarray as xr

from nt2gui.fakeloader import FakeSimulation
from nt2gui.summary import describe_grid, describe_times, summarize


def test_describe_times():
    assert describe_times([2.0, 0.5, 1.0]) == {"count": 3, "min": 0.5, "max": 2.0}
    assert describe_times([]) is None


def test_describe_grid_reports_axes_quantities_and_times():
    ds = xr.Dataset(
        {"Bx": (("t", "y", "x"), np.zeros((3, 2, 4))), "Ex": (("t", "y", "x"), np.zeros((3, 2, 4)))},
        coords={"t": [0.0, 1.0, 2.0], "x": [0.5, 1.5, 2.5, 3.5], "y": [-1.0, 1.0]},
    )
    assert describe_grid(ds) == {
        "axes": [
            {"name": "y", "size": 2, "min": -1.0, "max": 1.0},
            {"name": "x", "size": 4, "min": 0.5, "max": 3.5},
        ],
        "quantities": ["Bx", "Ex"],
        "times": {"count": 3, "min": 0.0, "max": 2.0},
    }


def test_describe_grid_of_empty_dataset():
    assert describe_grid(xr.Dataset()) is None


def test_summary_of_demo_simulation():
    summary = summarize(FakeSimulation("demo:x"))

    fields = summary["fields"]
    assert [a["name"] for a in fields["axes"]] == ["x", "y", "z"]
    assert fields["axes"][0]["size"] == 100
    assert fields["times"]["count"] == 50
    assert "rho" in fields["quantities"]

    particles = summary["particles"]
    assert [(s["label"], s["count"]) for s in particles["species"]] == [
        ("e-", 20_000),
        ("e+", 20_000),
        ("photons", 20_000),
    ]
    assert particles["countsAt"] == 0.0
    assert {"x", "ux", "w"} <= set(particles["quantities"])
    assert summary["spectra"] is None


def test_summary_endpoint(tmp_path):
    from nt2gui.app import create_app

    client = create_app(tmp_path / "s.json").test_client()
    sim_id = client.post("/api/simulations", json={"path": "demo:run"}).get_json()["simulations"][0]["id"]

    body = client.get(f"/api/simulations/{sim_id}/summary").get_json()
    assert body["fields"]["times"]["count"] == 50
    assert client.get("/api/simulations/nope/summary").status_code == 404


def test_sidebar_state_round_trips(tmp_path):
    from nt2gui.app import create_app

    client = create_app(tmp_path / "s.json").test_client()
    state = client.get("/api/state").get_json()["state"] | {"sidebarCollapsed": True}
    assert client.put("/api/state", json={"revision": 0, "state": state}).status_code == 200
    assert client.get("/api/state").get_json()["state"]["sidebarCollapsed"] is True
