import json

import pytest

from nt2gui.session.schema import (
    SCHEMA_VERSION,
    SimulationRecord,
    UiState,
    default_session,
)
from nt2gui.session.store import RevisionConflict, SessionStore


def make_state(**overrides):
    state = default_session().state.to_wire()
    state.update(overrides)
    return UiState.model_validate(state)


def test_starts_with_default_session_when_no_file(tmp_path):
    store = SessionStore(tmp_path / "session.json")
    snapshot = store.snapshot()

    assert snapshot["revision"] == 0
    assert snapshot["state"]["layout"]["layout"] == {"type": "row", "children": []}
    assert snapshot["state"]["globalViewport"] is None
    assert snapshot["simulations"] == []
    # Nothing is written until something changes.
    assert not (tmp_path / "session.json").exists()


def test_replace_state_bumps_revision_and_persists(tmp_path):
    path = tmp_path / "nested" / "session.json"
    store = SessionStore(path)
    viewport = {"xMin": 0, "xMax": 1, "yMin": 2, "yMax": 3}

    snapshot = store.replace_state(make_state(globalViewport=viewport), 0)

    assert snapshot["revision"] == 1
    assert snapshot["state"]["globalViewport"] == viewport
    on_disk = json.loads(path.read_text())
    assert on_disk["schemaVersion"] == SCHEMA_VERSION
    assert on_disk["revision"] == 1
    assert on_disk["state"]["globalViewport"] == viewport


def test_session_survives_restart(tmp_path):
    path = tmp_path / "session.json"
    store = SessionStore(path)
    store.replace_state(
        make_state(timeline={"current": 3, "min": 0, "max": 9, "step": 1}), 0
    )

    reopened = SessionStore(path)

    assert reopened.snapshot() == store.snapshot()


def test_stale_revision_is_rejected_with_current_snapshot(tmp_path):
    store = SessionStore(tmp_path / "session.json")
    store.replace_state(make_state(), 0)

    with pytest.raises(RevisionConflict) as conflict:
        store.replace_state(make_state(), 0)

    assert conflict.value.snapshot["revision"] == 1
    assert store.snapshot()["revision"] == 1


def test_update_applies_mutation_and_revalidates(tmp_path):
    store = SessionStore(tmp_path / "session.json")

    snapshot = store.update(
        lambda session: session.simulations.append(SimulationRecord(id="a", path="/p"))
    )

    assert snapshot["revision"] == 1
    assert snapshot["simulations"] == [{"id": "a", "path": "/p"}]


def test_failed_update_leaves_session_untouched(tmp_path):
    store = SessionStore(tmp_path / "session.json")

    def bad_mutation(session):
        session.state.timeline.step = -1  # invalid, caught on re-validation

    with pytest.raises(ValueError):
        store.update(bad_mutation)

    assert store.snapshot()["revision"] == 0
    assert store.snapshot()["state"]["timeline"]["step"] == 1


def test_optional_fields_round_trip_without_becoming_null(tmp_path):
    store = SessionStore(tmp_path / "session.json")
    plotters = {
        "p1": {
            "plotType": "pseudocolor",
            "dataType": "fields",
            "pseudocolorConfig": {
                "field": "f",
                "xCoordinate": "x",
                "yCoordinate": "y",
                "colorMap": "viridis",
            },
        }
    }

    snapshot = store.replace_state(make_state(plotters=plotters), 0)

    assert snapshot["state"]["plotters"] == plotters


def test_corrupt_file_is_backed_up_and_replaced_by_default(tmp_path):
    path = tmp_path / "session.json"
    path.write_text("{not json")

    store = SessionStore(path)

    assert store.snapshot()["revision"] == 0
    assert (tmp_path / "session.json.corrupt").read_text() == "{not json"


def test_newer_schema_version_is_not_loaded(tmp_path):
    path = tmp_path / "session.json"
    session = default_session().to_wire()
    session["schemaVersion"] = SCHEMA_VERSION + 1
    path.write_text(json.dumps(session))

    store = SessionStore(path)

    assert store.snapshot()["revision"] == 0
    assert (tmp_path / "session.json.corrupt").exists()


def test_save_leaves_no_temp_files(tmp_path):
    store = SessionStore(tmp_path / "session.json")
    store.replace_state(make_state(), 0)
    store.replace_state(make_state(), 1)

    assert [p.name for p in tmp_path.iterdir()] == ["session.json"]


def test_v1_session_file_is_migrated(tmp_path):
    path = tmp_path / "session.json"
    v1 = default_session().to_wire()
    v1["schemaVersion"] = 1
    del v1["state"]["globalLineViewports"]
    path.write_text(json.dumps(v1))

    store = SessionStore(path)

    assert store.snapshot()["state"]["globalLineViewports"] == {}
    assert store.session.schema_version == SCHEMA_VERSION


def test_unversioned_file_is_treated_as_v1(tmp_path):
    path = tmp_path / "session.json"
    raw = default_session().to_wire()
    del raw["schemaVersion"]
    del raw["state"]["globalLineViewports"]
    path.write_text(json.dumps(raw))

    assert SessionStore(path).snapshot()["state"]["globalLineViewports"] == {}
