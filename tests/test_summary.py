import numpy as np
import pytest
import xarray as xr

from helpers import load_demo
from nt2gui.data.metadata import (
    describe_grid,
    describe_times,
    mixed_runs_warning,
    summarize,
)
from nt2gui.sources.demo import DemoSimulation


def test_describe_times():
    assert describe_times([2.0, 0.5, 1.0]) == {"count": 3, "min": 0.5, "max": 2.0}
    assert describe_times([]) is None


def test_describe_grid_reports_axes_quantities_and_times():
    ds = xr.Dataset(
        {
            "Bx": (("t", "y", "x"), np.zeros((3, 2, 4))),
            "Ex": (("t", "y", "x"), np.zeros((3, 2, 4))),
        },
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
    summary = summarize(DemoSimulation("demo:x"))

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


def test_summary_endpoint(client):
    sim_id = load_demo(client)

    body = client.get(f"/api/simulations/{sim_id}/summary").get_json()
    assert body["fields"]["times"]["count"] == 50
    assert client.get("/api/simulations/nope/summary").status_code == 404


def _outputs(steps, times):
    return xr.Dataset(
        {"Bx": (("t", "x"), np.zeros((len(times), 2)))},
        coords={"t": times, "s": ("t", steps), "x": [0.0, 1.0]},
    )


def test_outputs_of_one_run_raise_no_warning():
    # A restart from a checkpoint (3817) after output 3821 was written.
    one_run = _outputs([1, 383, 3821, 3817, 4199], [0.13, 50.2, 501.3, 500.8, 550.9])
    assert mixed_runs_warning(one_run) is None
    assert mixed_runs_warning(_outputs([0, 1], [0.0, 1.0]).drop_vars("s")) is None


def test_outputs_of_different_runs_are_flagged():
    # An old run (dt 0.0026, every 39 steps) under a new one (dt 0.131).
    mixed = _outputs([1, 40, 79, 383], [0.1312, 0.105, 0.2073, 50.25])
    warning = mixed_runs_warning(mixed)
    assert warning is not None
    assert "step 1 is at t = 0.1312 but the later step 40 at t = 0.105" in warning
