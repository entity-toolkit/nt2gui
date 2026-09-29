import base64
import os
from io import BytesIO
from pathlib import Path

import matplotlib.image as mpimg
import numpy as np
import pytest
import xarray as xr

from fakeloader import FakeSimulation
from nt2loader import combined_timeline, parse_species_info
from pseudocolor import render_pseudocolor
from sources import open_simulation

INFO = """
    Particles
    - Species #1:
      - Label: e-
      - Mass: 1.0
      - Charge: -1.0
      - Max #: 1000000 [per domain]
      - Pusher: boris
    - Species #2:
      - Label: ph
      - Mass: 0.0
      - Charge: 0.0
    Output
    - Label: not a species property
"""


class TestSpeciesInfo:
    def test_parses_label_mass_and_charge(self):
        assert parse_species_info(INFO) == {
            1: {"label": "e-", "mass": 1.0, "charge": -1.0},
            2: {"label": "ph", "mass": 0.0, "charge": 0.0},
        }

    def test_no_species_section(self):
        assert parse_species_info("Simulation\n  - Name: x\n") == {}

    def test_unparseable_numbers_are_skipped(self):
        text = "- Species #3:\n  - Label: p\n  - Mass: heavy\n"
        assert parse_species_info(text) == {3: {"label": "p"}}


class TestTimeline:
    def test_spans_all_outputs_with_the_finest_step(self):
        fields = np.array([0.0, 1.0, 2.0])
        particles = np.array([0.5, 1.0, 3.0])
        assert combined_timeline(fields, particles) == {
            "current": 0.0,
            "min": 0.0,
            "max": 3.0,
            "step": 0.5,
        }

    def test_single_output(self):
        assert combined_timeline(np.array([2.0]))["step"] == 1.0

    def test_no_outputs(self):
        assert combined_timeline()["max"] == 1.0


class TestOpenSimulation:
    def test_demo_prefix_gives_synthetic_data(self):
        simulation = open_simulation("demo:anything", "abc")
        assert isinstance(simulation, FakeSimulation)
        assert simulation.id == "abc"

    def test_missing_directory_is_an_error(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="No such directory"):
            open_simulation(str(tmp_path / "nope"))

    def test_directory_without_output_is_an_error(self, tmp_path):
        with pytest.raises(Exception):
            open_simulation(str(tmp_path))


def test_pseudocolor_puts_y_vertically_and_x_horizontally():
    # Non-square grid, value increasing along x only.
    x = np.linspace(0, 1, 40)
    y = np.linspace(0, 1, 10)
    xx, _ = np.meshgrid(x, y, indexing="ij")
    ds = xr.Dataset({"f": (("x", "y"), xx)}, coords={"x": x, "y": y})

    result = render_pseudocolor(
        ds, {"field": "f", "xCoordinate": "x", "yCoordinate": "y", "colorMap": "gray"}, 0
    )

    image = mpimg.imread(BytesIO(base64.b64decode(result["image"])))[..., 0]
    middle_row = image[image.shape[0] // 2]
    middle_column = image[:, image.shape[1] // 2]
    # Brightness grows left to right and is constant top to bottom.
    assert middle_row[-5] > middle_row[5] + 0.5
    assert np.ptp(middle_column[5:-5]) < 0.05
    assert result["extent"] == {"xMin": 0.0, "xMax": 1.0, "yMin": 0.0, "yMax": 1.0}


# --- real Entity output ---------------------------------------------------------

DATA = Path(
    os.environ.get(
        "NT2GUI_TEST_DATA",
        Path.home() / "Codes/entity/temp/deposit/dep-esirkepov",
    )
)
real_data = pytest.mark.skipif(
    not DATA.is_dir(), reason=f"no Entity output at {DATA} (set NT2GUI_TEST_DATA)"
)


@pytest.fixture(scope="module")
def real_client(tmp_path_factory):
    pytest.importorskip("nt2")
    from index import create_app

    client = create_app(tmp_path_factory.mktemp("state") / "s.json").test_client()
    added = client.post("/simulations", json={"path": str(DATA)})
    assert added.status_code == 200, added.get_json()
    return client, added.get_json()


@real_data
def test_real_output_opens_with_a_timeline(real_client):
    _, snapshot = real_client
    timeline = snapshot["state"]["timeline"]
    assert timeline["max"] > timeline["min"] and timeline["step"] > 0


@real_data
def test_real_fields_render_in_1d_and_2d(real_client):
    client, snapshot = real_client
    sim_id = snapshot["simulations"][0]["id"]
    meta = client.get(f"/simulations/{sim_id}/fields").get_json()
    field = meta["fields"][0]
    dims = field["dims"]
    time = snapshot["state"]["timeline"]["max"]

    line = client.post(
        f"/simulations/{sim_id}/render/line",
        json={"config": {"quantities": [field["name"]], "axis": dims[0]}, "time": time},
    )
    assert line.status_code == 200, line.get_json()
    assert len(line.get_json()["coordinates"]) == len(meta["coords"][dims[0]])

    if len(dims) >= 2:
        image = client.post(
            f"/simulations/{sim_id}/render/pseudocolor",
            json={
                "config": {
                    "field": field["name"],
                    "xCoordinate": dims[-1],
                    "yCoordinate": dims[-2],
                    "colorMap": "viridis",
                },
                "time": time,
            },
        )
        assert image.status_code == 200, image.get_json()


@real_data
def test_real_particles_histogram(real_client):
    client, snapshot = real_client
    sim_id = snapshot["simulations"][0]["id"]
    meta = client.get(f"/simulations/{sim_id}/particles").get_json()
    if not meta["species"]:
        pytest.skip("this output has no particles")

    assert "gamma" in [q["name"] for q in meta["quantities"]]
    histogram = client.post(
        f"/simulations/{sim_id}/render/particles/histogram",
        json={
            "config": {
                "x": {"quantity": "gamma", "scale": "log", "bins": 20},
                "series": [{"species": []}],
            },
            "time": snapshot["state"]["timeline"]["min"],
        },
    )
    assert histogram.status_code == 200, histogram.get_json()
    assert len(histogram.get_json()["edges"]) == 21


@real_data
def test_real_output_summary(real_client):
    client, snapshot = real_client
    sim_id = snapshot["simulations"][0]["id"]
    summary = client.get(f"/simulations/{sim_id}/summary").get_json()

    assert summary["fields"]["axes"] and summary["fields"]["quantities"]
    assert summary["fields"]["times"]["count"] >= 1
    if summary["particles"]:
        assert all("count" in s for s in summary["particles"]["species"])
