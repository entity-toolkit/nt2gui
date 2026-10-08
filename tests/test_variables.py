import numpy as np
import pandas as pd
import pytest
import xarray as xr

from helpers import load_demo
from nt2gui.data.expressions import (
    ExpressionError,
    evaluate,
    expanded_names,
    variable_definitions,
)
from nt2gui.data.particles import particle_dataset, quantity_values, required_columns
from nt2gui.data.quantities import quantity_arrays, quantity_dims
from nt2gui.plots.line import render_line
from nt2gui.session.schema import UiState, default_session
from nt2gui.session.templates import apply_template, template_from_state


@pytest.fixture
def fields():
    x = np.linspace(0, 1, 5)
    return xr.Dataset(
        {
            "Ex": ("x", x),
            "Ey": ("x", 2 * x),
            "Bx": ("x", np.ones(5)),
            "By": ("x", np.ones(5)),
        },
        coords={"x": x},
    )


VARIABLES = {
    "edotb": "Ex*Bx + Ey*By",
    "bmag": "sqrt(Bx**2 + By**2)",
    "epar": "edotb / bmag",
}


class TestEvaluation:
    def test_variables_use_each_other(self, fields):
        epar = evaluate("epar", fields, VARIABLES)
        expected = 3 * fields.x / np.sqrt(2)
        assert np.allclose(epar.values, expected.values)
        assert np.allclose(
            evaluate("2 * epar + edotb", fields, VARIABLES).values,
            (2 * expected + 3 * fields.x).values,
        )

    def test_fields_win_over_variables_of_the_same_name(self, fields):
        assert np.allclose(evaluate("Ex", fields, {"Ex": "Ey"}).values, fields.Ex)

    def test_loops_and_errors_name_the_variable(self, fields):
        with pytest.raises(ExpressionError, match="loop: a → b → a"):
            evaluate("a", fields, {"a": "b + 1", "b": "a * Ex"})
        with pytest.raises(ExpressionError, match="In 'bad': Unknown name 'Q'"):
            evaluate("Ex + bad", fields, {"bad": "Q * 2"})

    def test_named_quantities_keep_their_name(self, fields):
        arrays = quantity_arrays(["epar", "Ex"], fields, VARIABLES)
        assert [a.name for a in arrays] == ["epar", "Ex"]
        assert quantity_dims("epar", fields, VARIABLES) == ["x"]
        line = render_line(fields, ["epar"], "x", {}, 0, variables=VARIABLES)
        assert line["series"][0]["name"] == "epar"

    def test_unknown_bare_names_are_still_rejected(self, fields):
        with pytest.raises(Exception, match="Unknown quantity 'nope'"):
            quantity_arrays(["nope"], fields, VARIABLES)


class TestDefinitions:
    def test_validated(self):
        assert variable_definitions(None) == {}
        assert variable_definitions({"a": " Ex "}) == {"a": "Ex"}
        for bad, message in [
            ({"2a": "Ex"}, "can't be a variable name"),
            ({"sqrt": "Ex"}, "built-in"),
            ({"a": ""}, "needs an expression"),
            (["a"], "must be an object"),
        ]:
            with pytest.raises(ExpressionError, match=message):
                variable_definitions(bad)

    def test_schema_requires_unique_identifiers(self):
        state = default_session().state.to_wire()
        with pytest.raises(ValueError, match="unique"):
            UiState.model_validate(
                state
                | {
                    "particleVariables": [
                        {"name": "a", "expression": "ux"},
                        {"name": "a", "expression": "uy"},
                    ]
                }
            )
        with pytest.raises(ValueError):
            UiState.model_validate(
                state | {"fieldVariables": [{"name": "a b", "expression": "Ex"}]}
            )


class TestParticles:
    def test_columns_needed_through_variables(self):
        columns = ["x", "ux", "uy", "uz", "w"]
        variables = {"uperp": "sqrt(uy**2 + uz**2)", "ratio": "uperp / gamma"}
        assert required_columns(["ratio"], columns, variables) == [
            "ux",
            "uy",
            "uz",
            "w",
        ]
        assert expanded_names("ratio", variables, lambda n: n in columns) == {
            "uy",
            "uz",
            "sqrt",
            "gamma",
        }

    def test_values(self):
        frame = pd.DataFrame(
            {"ux": [3.0], "uy": [4.0], "uz": [0.0], "w": [1.0], "sp": [1]}
        )
        values = quantity_values(
            "uperp2", particle_dataset(frame), {"uperp2": "uy**2 + uz**2"}
        )
        assert values.tolist() == [16.0]


def test_templates_carry_variables():
    wire = default_session().state.to_wire()
    source = UiState.model_validate(
        wire | {"fieldVariables": [{"name": "edotb", "expression": "Ex*Bx"}]}
    )
    template = template_from_state(source, "t")
    target = UiState.model_validate(
        wire
        | {
            "fieldVariables": [
                {"name": "edotb", "expression": "old"},
                {"name": "keep", "expression": "Ey"},
            ]
        }
    )
    apply_template(target, template, None)
    assert [(v.name, v.expression) for v in target.field_variables] == [
        ("keep", "Ey"),
        ("edotb", "Ex*Bx"),
    ]


class TestApi:
    def test_render_and_check_with_variables(self, client):
        sim = load_demo(client)
        variables = {"edotb": "Ex*Bx + Ey*By + Ez*Bz", "epar": "edotb / sqrt(Bx**2)"}
        check = client.post(
            f"/api/simulations/{sim}/quantities/check",
            json={"expression": "epar * 2", "variables": variables},
        )
        assert check.status_code == 200, check.get_json()
        assert check.get_json()["dims"] == ["x", "y"]
        assert (
            client.post(
                f"/api/simulations/{sim}/quantities/check",
                json={"expression": "epar"},
            ).status_code
            == 400
        )
        line = client.post(
            f"/api/simulations/{sim}/render/line",
            json={
                "time": 0,
                "config": {"quantities": ["epar"], "axis": "x"},
                "variables": variables,
            },
        )
        assert line.status_code == 200, line.get_json()
        assert line.get_json()["series"][0]["name"] == "epar"
        image = client.post(
            f"/api/simulations/{sim}/render/pseudocolor",
            json={
                "time": 0,
                "config": {"field": "edotb", "smoothing": {"x": 0.5}},
                "variables": variables,
            },
        )
        assert image.status_code == 200, image.get_json()
        assert image.get_json()["smoothing"]["x"] > 1

    def test_particle_renders_with_variables(self, client):
        sim = load_demo(client)
        variables = {"uperp": "sqrt(uy**2 + uz**2)"}
        response = client.post(
            f"/api/simulations/{sim}/render/particles/histogram",
            json={
                "time": 0,
                "config": {
                    "x": {"quantity": "uperp", "scale": "linear"},
                    "series": [{"species": []}],
                },
                "variables": variables,
            },
        )
        assert response.status_code == 200, response.get_json()
        assert (
            client.post(
                f"/api/simulations/{sim}/particles/check",
                json={"expression": "uperp / 2", "variables": variables},
            ).status_code
            == 200
        )
