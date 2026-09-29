import numpy as np
import pytest
import xarray as xr

from expressions import ExpressionError, evaluate


@pytest.fixture
def ds():
    x = np.array([0.0, 1.0, 2.0, 3.0])
    y = np.array([-1.0, 1.0])
    xx, yy = np.meshgrid(x, y, indexing="ij")
    return xr.Dataset(
        {
            "f": (("x", "y"), xx + yy),
            "g": (("x", "y"), 2 * np.ones_like(xx)),
            "Ex": (("x", "y"), 3 * np.ones_like(xx)),
            "Ey": (("x", "y"), 4 * np.ones_like(xx)),
            "Ez": (("x", "y"), 0 * xx),
            "profile": (("x",), x),
        },
        coords={"x": x, "y": y},
    )


def values(result):
    return result.transpose(*sorted(result.dims)).values


class TestArithmetic:
    def test_sum_of_fields(self, ds):
        np.testing.assert_allclose(values(evaluate("f + g", ds)), values(ds.f + 2))

    def test_vector_magnitude(self, ds):
        result = evaluate("sqrt(Ex**2 + Ey**2 + Ez**2)", ds)
        np.testing.assert_allclose(result.values, 5.0)
        assert set(result.dims) == {"x", "y"}

    @pytest.mark.parametrize(
        ("expression", "expected"),
        [
            ("-g", -2), ("+g", 2), ("g - 1", 1), ("g * 3", 6), ("g / 4", 0.5),
            ("7 // g", 3), ("7 % g", 1), ("g ** 3", 8), ("2 * pi * g / g", 2 * np.pi),
            ("log(e * g / g)", 1), ("np.exp(g - g)", 1), ("numpy.hypot(Ex, Ey)", 5),
            ("atan2(g, g) * 4", np.pi), ("maximum(g, Ex)", 3), ("clip(Ey, 0, 3.5)", 3.5),
            ("round(g / 3, 2)", 0.67), ("abs(-g)", 2),
        ],
    )
    def test_operators_and_functions(self, ds, expression, expected):
        np.testing.assert_allclose(evaluate(expression, ds).values, expected)

    def test_result_is_named_after_the_expression(self, ds):
        assert evaluate("  f + g ", ds).name == "f + g"


class TestCoordinatesAndBroadcasting:
    def test_coordinates_can_be_used(self, ds):
        result = evaluate("profile * x", ds)
        np.testing.assert_allclose(result.values, [0, 1, 4, 9])

    def test_coordinate_only_expression(self, ds):
        result = evaluate("sin(x) + y", ds)
        assert set(result.dims) == {"x", "y"}

    def test_mixed_dims_broadcast_by_name(self, ds):
        result = evaluate("profile + f", ds)
        assert set(result.dims) == {"x", "y"}
        np.testing.assert_allclose(result.sel(x=3, y=1).item(), 3 + 4)


class TestConditions:
    def test_where_keeps_dims(self, ds):
        result = evaluate("where(x > 1, profile, 0)", ds)
        assert result.dims == ("x",)
        np.testing.assert_allclose(result.values, [0, 0, 2, 3])

    def test_chained_comparison_and_logic(self, ds):
        np.testing.assert_allclose(evaluate("0 < x < 3", ds).values, [0, 1, 1, 0])
        np.testing.assert_allclose(
            evaluate("(x < 1) | (x > 2)", ds).values, [1, 0, 0, 1]
        )
        np.testing.assert_allclose(evaluate("~(x > 1)", ds).values, [1, 1, 0, 0])

    def test_boolean_results_become_floats(self, ds):
        assert evaluate("x > 1", ds).dtype == float


class TestInvalidOperations:
    def test_math_errors_become_nan_or_inf(self, ds):
        result = evaluate("log(profile)", ds)
        assert np.isneginf(result.values[0])

    def test_huge_powers_overflow_instead_of_hanging(self, ds):
        assert np.isinf(evaluate("g * 10**10**10", ds).values).all()


class TestRejected:
    @pytest.mark.parametrize(
        ("expression", "message"),
        [
            ("f +", "Invalid expression"),
            ("nope + f", "Unknown name 'nope'"),
            ("frobnicate(f)", "Unknown function 'frobnicate'"),
            ("sqrt + f", "is a function"),
            ("2 + 3", "at least one field"),
            ("f.values", "Unsupported syntax: Attribute"),
            ("f[0]", "Unsupported syntax: Subscript"),
            ("__import__('os').system('true')", "Only plain function calls"),
            ("__import__('os')", "Unknown function '__import__'"),
            ("os.system(f)", "Only plain function calls"),
            ("np.linalg.norm(f)", "Only plain function calls"),
            ("(lambda: f)()", "Only plain function calls"),
            ("lambda: f", "Unsupported syntax: Lambda"),
            ("[f for f in g]", "Unsupported syntax: ListComp"),
            ("f if g else g", "Unsupported syntax: IfExp"),
            ("f and g", "Unsupported syntax: BoolOp"),
            ("f @ g", "Unsupported operator: MatMult"),
            ("sqrt(f, out=g)", "Keyword arguments"),
            ("'text'", "Unsupported constant"),
            ("True + f", "Unsupported constant"),
            ("f = 1", "Invalid expression"),
            ("sqrt()", "Could not evaluate"),
        ],
    )
    def test_is_rejected(self, ds, expression, message):
        with pytest.raises(ExpressionError, match=message):
            evaluate(expression, ds)

    def test_length_limit(self, ds):
        with pytest.raises(ExpressionError, match="too long"):
            evaluate("f + " * 200 + "f", ds)

    def test_long_but_valid_nesting_evaluates(self, ds):
        # The length limit keeps nesting far below Python's recursion limit.
        np.testing.assert_allclose(values(evaluate("-" * 400 + "f", ds)), values(ds.f))
