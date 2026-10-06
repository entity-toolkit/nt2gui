import json

import numpy as np
import pytest

from helpers import load_demo, put_state
from nt2gui.app import create_app
from nt2gui.data.metadata import attribute_value
from nt2gui.errors import Conflict, NotFound, UserError
from nt2gui.session.schema import UiState, default_session
from nt2gui.session.templates import (
    TemplateStore,
    apply_template,
    template_from_state,
)


LAYOUT = {
    "global": {},
    "layout": {
        "type": "row",
        "children": [
            {
                "type": "tabset",
                "weight": 30,
                "children": [
                    {"type": "tab", "id": "a", "component": "panel", "name": "Spectrum"},
                    {"type": "tab", "id": "b", "component": "panel", "name": "Density"},
                ],
            }
        ],
    },
}


def plotters(simulation_id="sim"):
    return {
        "a": {
            "plotType": "line",
            "dataType": "particles",
            "simulationId": simulation_id,
            "syncTime": False,
            "localTime": 0.4,
            "particleHistogramConfig": {
                "x": {"quantity": "gamma", "scale": "log", "min": 1, "max": 100},
                "series": [{"species": [1], "regions": ["region-01"]}],
                "yMin": 1e-3,
            },
        },
        "b": {
            "plotType": "pseudocolor",
            "dataType": "fields",
            "simulationId": simulation_id,
            "useGlobalViewport": False,
            "localViewport": {"xMin": 0, "xMax": 1, "yMin": 0, "yMax": 1},
            "showRegions": True,
            "pseudocolorConfig": {
                "field": "rho",
                "slices": {"z": 0.5},
                "vmin": 0,
                "vmax": 2,
                "colorScale": "power",
                "colorPower": 0.3,
                "expressions": ["2*rho"],
            },
        },
        "c": {"plotType": "none", "dataType": "none"},
    }


def state(**overrides):
    wire = default_session().state.to_wire() | {
        "layout": LAYOUT,
        "plotters": plotters(),
        "globalViewport": {"xMin": 0, "xMax": 1, "yMin": 0, "yMax": 1},
        "globalLineViewports": {"x": {"min": 0, "max": 1}},
        "regions": [{"name": "region-01", "ranges": {"x": {"min": 0, "max": 1}}}],
    }
    return UiState.model_validate(wire | overrides)


class TestTemplateContents:
    def test_keeps_the_plots_and_drops_what_ties_them_to_a_run(self):
        template = template_from_state(state(), "shock")
        assert template.layout == LAYOUT
        a = template.plotters["a"].to_wire()
        assert a == {
            "plotType": "line",
            "dataType": "particles",
            "particleHistogramConfig": {
                "x": {"quantity": "gamma", "scale": "log", "min": 1, "max": 100},
                "series": [{"species": [1]}],
                "yMin": 1e-3,
            },
        }
        b = template.plotters["b"].to_wire()
        assert b == {
            "plotType": "pseudocolor",
            "dataType": "fields",
            "pseudocolorConfig": {
                "field": "rho",
                "vmin": 0,
                "vmax": 2,
                "colorScale": "power",
                "colorPower": 0.3,
                "expressions": ["2*rho"],
            },
        }

    def test_line_slices_are_emptied(self):
        line = {
            "plotType": "line",
            "dataType": "fields",
            "lineConfig": {"quantities": ["E"], "axis": "x", "slices": {"y": 2}},
            "lineViewport": {"min": 0, "max": 1},
        }
        template = template_from_state(state(plotters={"a": line}), "t")
        assert template.plotters["a"].to_wire() == {
            "plotType": "line",
            "dataType": "fields",
            "lineConfig": {"quantities": ["E"], "axis": "x", "slices": {}},
        }

    def test_applying_replaces_panels_and_resets_zoom(self):
        template = template_from_state(state(), "t")
        target = state(layout={"global": {}, "layout": {"type": "row", "children": []}})
        apply_template(target, template, "other")
        assert target.layout == LAYOUT
        assert target.plotters["a"].simulation_id == "other"
        assert target.plotters["b"].simulation_id == "other"
        assert target.plotters["c"].simulation_id is None
        assert target.global_viewport is None and target.global_line_viewports == {}
        # Regions and the timeline belong to the session, not the template.
        assert [r.name for r in target.regions] == ["region-01"]


class TestTemplateStore:
    def test_save_rename_remove_and_persist(self, tmp_path):
        path = tmp_path / "templates.json"
        store = TemplateStore(path)
        listing = store.save(template_from_state(state(), "shock"))
        assert listing[0]["name"] == "shock" and listing[0]["panels"] == 2
        with pytest.raises(Conflict, match="already exists"):
            store.save(template_from_state(state(), "shock"))
        store.save(template_from_state(state(plotters={}), "shock"), overwrite=True)
        assert store.summaries()[0]["panels"] == 0

        store.save(template_from_state(state(), "other"))
        with pytest.raises(Conflict, match="already called"):
            store.rename("shock", "other")
        with pytest.raises(UserError, match="can't contain"):
            store.rename("shock", "a/b")
        store.rename("shock", " reconnection ")
        assert [t["name"] for t in TemplateStore(path).summaries()] == [
            "reconnection",
            "other",
        ]
        store.remove("other")
        with pytest.raises(NotFound):
            store.get("other")
        assert json.loads(path.read_text())["schemaVersion"] == 1

    def test_unreadable_file_is_set_aside(self, tmp_path):
        path = tmp_path / "templates.json"
        path.write_text("{not json")
        assert TemplateStore(path).summaries() == []
        assert path.with_suffix(".json.corrupt").exists()


class TestTemplateApi:
    def test_round_trip_through_a_new_simulation(self, client, state_file):
        first = load_demo(client)
        current = client.get("/api/state").get_json()["state"]
        assert put_state(
            client, layout=LAYOUT, plotters=plotters(first)
        ).status_code == 200

        response = client.post("/api/templates", json={"name": "demo plots"})
        assert response.status_code == 200
        assert response.get_json()["templates"][0]["name"] == "demo plots"
        assert (state_file.parent / "templates.json").exists()
        assert client.post(
            "/api/templates", json={"name": "demo plots"}
        ).status_code == 409

        second = load_demo(client, "demo:run2")
        put_state(client, layout=current["layout"], plotters={})
        snapshot = client.post(
            "/api/templates/demo plots/apply", json={"simulationId": second}
        ).get_json()
        assert snapshot["state"]["layout"] == LAYOUT
        assert snapshot["state"]["plotters"]["a"]["simulationId"] == second
        assert "localTime" not in snapshot["state"]["plotters"]["a"]

        assert client.post(
            "/api/templates/demo plots/apply", json={"simulationId": "nope"}
        ).status_code == 404
        assert client.post(
            "/api/templates/missing/apply", json={}
        ).status_code == 404

        renamed = client.patch("/api/templates/demo plots", json={"name": "shock"})
        assert [t["name"] for t in renamed.get_json()["templates"]] == ["shock"]
        assert client.delete("/api/templates/shock").get_json() == {"templates": []}

    def test_templates_outlive_the_session(self, state_file):
        client = create_app(state_file).test_client()
        client.post("/api/templates", json={"name": "kept"})
        client.post("/api/session/import", json={"session": {"state": {}}})
        restarted = create_app(state_file).test_client()
        names = [t["name"] for t in restarted.get("/api/templates").get_json()["templates"]]
        assert names == ["kept"]


class TestReloadAndAttributes:
    def test_reload_keeps_id_name_and_time(self, client):
        sim = load_demo(client)
        put_state(client, timeline={"current": 0.5, "min": 0, "max": 1, "step": 0.1})
        response = client.post(f"/api/simulations/{sim}/reload")
        assert response.status_code == 200
        snapshot = response.get_json()
        assert [s["id"] for s in snapshot["simulations"]] == [sim]
        assert snapshot["simulations"][0]["name"] == "run1"
        assert snapshot["state"]["timeline"]["current"] == 0.5
        assert client.get(f"/api/simulations/{sim}/summary").status_code == 200
        assert client.post("/api/simulations/nope/reload").status_code == 404

    def test_attributes_are_plain_json(self, client):
        sim = load_demo(client)
        attrs = client.get(f"/api/simulations/{sim}/attrs").get_json()["attrs"]
        assert attrs["simulation.name"] == "run1"
        assert attrs["grid.resolution"] == [100, 128, 9]
        assert attrs["algorithms.timestep.CFL"] == 0.5
        assert list(attrs) == sorted(attrs)

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (np.bytes_(b"cart  "), "cart"),
            (np.float32(0.1), 0.1),
            (np.uint64(7), 7),
            (np.bool_(True), True),
            (np.array([b"E  ", b"B"], dtype="S3"), ["E", "B"]),
            (np.array([[1, 2], [3, 4]]), [1, 2, 3, 4]),
            (float("inf"), "inf"),
            (None, "None"),
        ],
    )
    def test_attribute_values(self, value, expected):
        assert attribute_value(value) == expected
