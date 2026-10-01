import os
from pathlib import Path

import numpy as np
import pytest

from nt2gui.sources.nt2 import parse_species_info

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
    from nt2gui.app import create_app

    client = create_app(tmp_path_factory.mktemp("state") / "s.json").test_client()
    added = client.post("/api/simulations", json={"path": str(DATA)})
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
    meta = client.get(f"/api/simulations/{sim_id}/fields").get_json()
    field = meta["fields"][0]
    dims = field["dims"]
    time = snapshot["state"]["timeline"]["max"]

    line = client.post(
        f"/api/simulations/{sim_id}/render/line",
        json={"config": {"quantities": [field["name"]], "axis": dims[0]}, "time": time},
    )
    assert line.status_code == 200, line.get_json()
    assert len(line.get_json()["coordinates"]) == len(meta["coords"][dims[0]])

    if len(dims) >= 2:
        image = client.post(
            f"/api/simulations/{sim_id}/render/pseudocolor",
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
    meta = client.get(f"/api/simulations/{sim_id}/particles").get_json()
    if not meta["species"]:
        pytest.skip("this output has no particles")

    assert "gamma" in [q["name"] for q in meta["quantities"]]
    histogram = client.post(
        f"/api/simulations/{sim_id}/render/particles/histogram",
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
    summary = client.get(f"/api/simulations/{sim_id}/summary").get_json()

    assert summary["fields"]["axes"] and summary["fields"]["quantities"]
    assert summary["fields"]["times"]["count"] >= 1
    if summary["particles"]:
        assert all("count" in s for s in summary["particles"]["species"])


@pytest.fixture(scope="module")
def real_simulation():
    pytest.importorskip("nt2")
    from nt2gui.sources import open_simulation

    return open_simulation(str(DATA))


def count_reads(simulation, category):
    """Count the nt2py reader's disk reads of `category` from now on."""
    inner = simulation._data._fields.reader._reader
    original = inner.ReadArrayAtTimestep
    calls = []

    def counted(path, cat, quantity, step):
        if cat == category:
            calls.append((quantity, step))
        return original(path, cat, quantity, step)

    inner.ReadArrayAtTimestep = counted
    return calls


@real_data
def test_field_steps_are_read_from_disk_once(real_simulation):
    from nt2gui.plots.pseudocolor import render_pseudocolor
    from nt2gui.session.schema import PseudocolorConfig

    fields = real_simulation.fields
    name = next(iter(fields.data_vars))
    dims = [d for d in fields[name].dims if d != "t"]
    time = float(fields.t[0])
    reads = count_reads(real_simulation, "fields")
    for color_map in ("viridis", "magma", "viridis"):
        config = PseudocolorConfig.model_validate(
            {"field": name, "xCoordinate": dims[-1], "yCoordinate": dims[-2], "colorMap": color_map}
        )
        render_pseudocolor(fields, config, time)
    assert len(reads) == 1


@real_data
def test_particle_requests_read_only_their_columns(real_simulation):
    if not real_simulation.species:
        pytest.skip("this output has no particles")
    time = float(real_simulation.particle_times[-1])
    column = real_simulation.particle_columns[0]

    frame = real_simulation.particles(time, [column])
    assert list(frame.columns) == ["sp", column]
    counts = real_simulation.species_counts(time)
    assert sum(counts.values()) == len(frame)


@real_data
def test_metadata_and_summary_read_no_particle_data(real_client, monkeypatch):
    client, snapshot = real_client
    import nt2gui.sources.nt2 as nt2_source

    loads = []
    original = nt2_source.Nt2Simulation.particles

    def tracking(self, time, columns=None):
        loads.append(None if columns is None else list(columns))
        return original(self, time, columns)

    monkeypatch.setattr(nt2_source.Nt2Simulation, "particles", tracking)
    sim_id = snapshot["simulations"][0]["id"]
    client.get(f"/api/simulations/{sim_id}/particles")
    client.post(f"/api/simulations/{sim_id}/particles/check", json={"expression": "x * 2"})
    client.get(f"/api/simulations/{sim_id}/summary")
    # At most the species index, for the counts.
    assert all(columns == [] for columns in loads)
