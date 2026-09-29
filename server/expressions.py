"""Safe evaluation of user-typed quantity expressions over an xarray dataset.

Expressions such as `f + g` or `sqrt(Ex**2 + Ey**2 + Ez**2)` are parsed with
`ast` and walked node by node; nothing is ever passed to `eval`. Only these
are allowed:

- numbers, and the constants `pi`, `e`, `inf`
- field names and coordinate names (e.g. `x`, `t`) of the dataset
- arithmetic `+ - * / // % **`, unary `+ -`, comparisons, and `& | ~`
  (useful inside `where(...)`)
- calls to the whitelisted numpy functions below, by bare name or as
  `np.<name>` / `numpy.<name>`

Arithmetic runs on xarray DataArrays, so operands broadcast by dimension name.
"""

import ast
import operator
from collections.abc import Callable
from typing import Any

import numpy as np
import xarray as xr

MAX_EXPRESSION_LENGTH = 500


class ExpressionError(ValueError):
    """The expression is malformed, unsupported, or refers to unknown names."""


FUNCTIONS: dict[str, Callable[..., Any]] = {
    name: getattr(np, name)
    for name in (
        # powers, exponentials, logarithms
        "sqrt cbrt square exp exp2 expm1 log log2 log10 log1p power "
        # trigonometry
        "sin cos tan arcsin arccos arctan arctan2 hypot deg2rad rad2deg "
        "sinh cosh tanh arcsinh arccosh arctanh "
        # rounding, sign, magnitude
        "abs absolute fabs sign floor ceil trunc rint "
        # element-wise combinations
        "minimum maximum fmin fmax heaviside "
        # checks
        "isfinite isnan isinf"
    ).split()
}


def _as_array(value: Any) -> Any:
    return value if isinstance(value, xr.DataArray) else xr.DataArray(value)


# Not ufuncs: numpy would return bare arrays and drop the dimension names, so
# these go through xarray.
FUNCTIONS |= {
    "where": xr.where,
    "clip": lambda value, lower, upper: _as_array(value).clip(lower, upper),
    "round": lambda value, decimals=0: _as_array(value).round(int(decimals)),
    "nan_to_num": lambda value: xr.apply_ufunc(np.nan_to_num, value),
}
# Common aliases.
FUNCTIONS |= {
    "asin": np.arcsin,
    "acos": np.arccos,
    "atan": np.arctan,
    "atan2": np.arctan2,
    "asinh": np.arcsinh,
    "acosh": np.arccosh,
    "atanh": np.arctanh,
    "ln": np.log,
}

CONSTANTS: dict[str, float] = {"pi": np.pi, "e": np.e, "inf": np.inf}

BINARY_OPERATORS: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.BitAnd: operator.and_,
    ast.BitOr: operator.or_,
}

UNARY_OPERATORS: dict[type[ast.unaryop], Callable[[Any], Any]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Invert: operator.invert,
}

COMPARISONS: dict[type[ast.cmpop], Callable[[Any, Any], Any]] = {
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}

NUMPY_MODULE_NAMES = ("np", "numpy")


def evaluate(expression: str, dataset: xr.Dataset) -> xr.DataArray:
    """Evaluate `expression` over `dataset`; raises ExpressionError."""
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ExpressionError(
            f"Expression is too long (max {MAX_EXPRESSION_LENGTH} characters)"
        )
    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except SyntaxError as error:
        raise ExpressionError(f"Invalid expression: {error.msg}") from error

    try:
        # Invalid operations (log(0), 0/0) give inf/nan, shown as gaps.
        with np.errstate(all="ignore"):
            result = _Evaluator(dataset).visit(tree.body)
    except RecursionError as error:
        raise ExpressionError("Expression is nested too deeply") from error
    except ExpressionError:
        raise
    except (TypeError, ValueError, ArithmeticError) as error:
        raise ExpressionError(f"Could not evaluate expression: {error}") from error

    if not isinstance(result, xr.DataArray):
        raise ExpressionError(
            "Expression must depend on at least one field or coordinate"
        )
    if result.dtype == bool:
        result = result.astype(float)
    return result.rename(expression.strip())


class _Evaluator(ast.NodeVisitor):
    def __init__(self, dataset: xr.Dataset) -> None:
        self.dataset = dataset

    def generic_visit(self, node: ast.AST) -> Any:
        raise ExpressionError(f"Unsupported syntax: {type(node).__name__}")

    def visit_Constant(self, node: ast.Constant) -> Any:
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ExpressionError(f"Unsupported constant: {node.value!r}")
        # Floats, never Python ints: `10**10**10` must overflow to inf
        # instead of computing a gigantic integer.
        return np.float64(node.value)

    def visit_Name(self, node: ast.Name) -> Any:
        name = node.id
        if name in self.dataset.data_vars:
            return self.dataset[name]
        if name in self.dataset.coords:
            return self.dataset.coords[name]
        if name in CONSTANTS:
            return np.float64(CONSTANTS[name])
        if name in FUNCTIONS:
            raise ExpressionError(f"'{name}' is a function; call it like {name}(...)")
        raise ExpressionError(f"Unknown name '{name}'")

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        op = BINARY_OPERATORS.get(type(node.op))
        if op is None:
            raise ExpressionError(f"Unsupported operator: {type(node.op).__name__}")
        return op(self.visit(node.left), self.visit(node.right))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        op = UNARY_OPERATORS.get(type(node.op))
        if op is None:
            raise ExpressionError(f"Unsupported operator: {type(node.op).__name__}")
        operand = self.visit(node.operand)
        if isinstance(node.op, ast.Invert):
            # `~` is only meaningful on conditions, e.g. where(~(x > 1), f, 0).
            operand = operand.astype(bool)
        return op(operand)

    def visit_Compare(self, node: ast.Compare) -> Any:
        # Chains like `0 < x < 1` are evaluated pairwise and combined with &.
        left = self.visit(node.left)
        result = None
        for op_node, right_node in zip(node.ops, node.comparators):
            op = COMPARISONS.get(type(op_node))
            if op is None:
                raise ExpressionError(
                    f"Unsupported comparison: {type(op_node).__name__}"
                )
            right = self.visit(right_node)
            step = op(left, right)
            result = step if result is None else result & step
            left = right
        return result

    def visit_Call(self, node: ast.Call) -> Any:
        if node.keywords:
            raise ExpressionError("Keyword arguments are not supported")
        function = FUNCTIONS.get(self._function_name(node.func))
        if function is None:
            raise ExpressionError(
                f"Unknown function '{self._function_name(node.func)}'"
            )
        return function(*(self.visit(arg) for arg in node.args))

    @staticmethod
    def _function_name(func: ast.expr) -> str:
        if isinstance(func, ast.Name):
            return func.id
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id in NUMPY_MODULE_NAMES
        ):
            return func.attr
        raise ExpressionError("Only plain function calls like sqrt(...) are allowed")
