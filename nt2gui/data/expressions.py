"""Safe evaluation of user-typed quantity expressions over an xarray dataset.

Expressions such as `f + g` or `sqrt(Ex**2 + Ey**2 + Ez**2)` are parsed with
`ast` and walked node by node; nothing is ever passed to `eval`. Only these
are allowed:

- numbers, and the constants `pi`, `e`, `inf`
- field names and coordinate names (e.g. `x`, `t`) of the dataset
- run attributes, when given: dotted names such as `setup.vel`, and list
  elements such as `grid.extent[0]` (Entity's `<block>.<subblock>.<name>`)
- named variables: user definitions such as `edotb = Ex*Bx + Ey*By + Ez*Bz`,
  which may use each other (`epar = edotb / sqrt(Bx**2 + By**2 + Bz**2)`)
- arithmetic `+ - * / // % **`, unary `+ -`, comparisons, and `& | ~`
  (useful inside `where(...)`)
- calls to the whitelisted numpy functions below, by bare name or as
  `np.<name>` / `numpy.<name>`

Arithmetic runs on xarray DataArrays, so operands broadcast by dimension name.
"""

import ast
import operator
from collections.abc import Callable, Mapping
from typing import Any

import numpy as np
import xarray as xr

from ..errors import UserError

MAX_EXPRESSION_LENGTH = 500
MAX_VARIABLES = 200

# Named variables (name -> expression); names are identifiers.
Variables = Mapping[str, str]


class ExpressionError(UserError):
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


def _parse(expression: str) -> ast.Expression:
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise ExpressionError(
            f"Expression is too long (max {MAX_EXPRESSION_LENGTH} characters)"
        )
    try:
        return ast.parse(expression.strip(), mode="eval")
    except SyntaxError as error:
        raise ExpressionError(f"Invalid expression: {error.msg}") from error


def evaluate(
    expression: str,
    dataset: xr.Dataset,
    variables: Variables | None = None,
    attrs: Mapping[str, Any] | None = None,
) -> xr.DataArray:
    """Evaluate `expression` over `dataset`, where `variables` may be used
    by name (each evaluated at most once) and `attrs` (a run's flat, dotted
    attributes) by their dotted names; raises ExpressionError."""
    tree = _parse(expression)
    try:
        # Invalid operations (log(0), 0/0) give inf/nan, shown as gaps.
        with np.errstate(all="ignore"):
            result = _Evaluator(dataset, variables or {}, attrs or {}).visit(
                tree.body
            )
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


def check_variable_name(name: str) -> str:
    """`name` if it can name a variable, else an ExpressionError saying why."""
    if not name.isidentifier():
        raise ExpressionError(
            f"'{name}' can't be a variable name: use letters, digits and _"
        )
    if name in CONSTANTS or name in FUNCTIONS or name in NUMPY_MODULE_NAMES:
        raise ExpressionError(f"'{name}' is a built-in name")
    return name


def variable_definitions(raw: Any) -> dict[str, str]:
    """Validated `{name: expression}` variables from a request (default none)."""
    if raw is None:
        return {}
    if not isinstance(raw, dict) or len(raw) > MAX_VARIABLES:
        raise ExpressionError(
            f"variables must be an object of at most {MAX_VARIABLES} definitions"
        )
    definitions: dict[str, str] = {}
    for name, expression in raw.items():
        if not isinstance(expression, str) or not expression.strip():
            raise ExpressionError(f"Variable '{name}' needs an expression")
        if len(expression) > MAX_EXPRESSION_LENGTH:
            raise ExpressionError(f"Variable '{name}' is too long")
        definitions[check_variable_name(str(name))] = expression.strip()
    return definitions


def expanded_names(
    expression: str, variables: Variables, known: Callable[[str], bool]
) -> set[str]:
    """Names `expression` uses, looking through the variables it refers to
    (names for which `known` is true come first, as in evaluation). Unparsable
    text gives no names; evaluating it reports the error."""
    names: set[str] = set()
    seen: set[str] = set()

    def visit(text: str) -> None:
        try:
            tree = ast.parse(text.strip(), mode="eval")
        except SyntaxError:
            return
        for node in ast.walk(tree):
            if not isinstance(node, ast.Name):
                continue
            name = node.id
            if not known(name) and name in variables:
                if name not in seen:
                    seen.add(name)
                    visit(variables[name])
            else:
                names.add(name)

    visit(expression)
    return names


def _dotted(node: ast.expr) -> str | None:
    """`a.b.c` for a chain of plain attribute accesses, else None."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return ".".join(reversed(parts))


def _attribute_number(value: Any, name: str) -> np.float64:
    if isinstance(value, (bool, np.bool_)) or not np.issubdtype(
        np.asarray(value).dtype, np.number
    ):
        raise ExpressionError(f"Attribute '{name}' is not a number")
    return np.float64(value)


class _Evaluator(ast.NodeVisitor):
    def __init__(
        self,
        dataset: xr.Dataset,
        variables: Variables,
        attrs: Mapping[str, Any],
    ) -> None:
        self.dataset = dataset
        self.variables = variables
        self.attrs = attrs
        self._values: dict[str, Any] = {}
        # Variables being evaluated, innermost last (to report cycles).
        self._stack: list[str] = []

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
        if name in self.variables:
            return self._variable(name)
        if name in CONSTANTS:
            return np.float64(CONSTANTS[name])
        if name in FUNCTIONS:
            raise ExpressionError(f"'{name}' is a function; call it like {name}(...)")
        raise ExpressionError(f"Unknown name '{name}'")

    def _attribute(self, node: ast.expr) -> tuple[str, Any]:
        name = _dotted(node)
        if name is None:
            raise ExpressionError("Unsupported syntax: Attribute")
        if name not in self.attrs:
            raise ExpressionError(f"Unknown attribute '{name}'")
        return name, self.attrs[name]

    def visit_Attribute(self, node: ast.Attribute) -> Any:
        if not self.attrs:  # only where a run's attributes are available
            return self.generic_visit(node)
        name, value = self._attribute(node)
        if np.ndim(value) > 0:
            raise ExpressionError(
                f"Attribute '{name}' is a list; pick an element, e.g. {name}[0]"
            )
        return _attribute_number(value, name)

    def visit_Subscript(self, node: ast.Subscript) -> Any:
        if not self.attrs:
            return self.generic_visit(node)
        index = node.slice
        negative = isinstance(index, ast.UnaryOp) and isinstance(index.op, ast.USub)
        constant = index.operand if negative else index  # type: ignore[union-attr]
        if not (
            isinstance(constant, ast.Constant)
            and isinstance(constant.value, int)
            and not isinstance(constant.value, bool)
        ):
            raise ExpressionError("Attribute lists are indexed by a whole number")
        name, value = self._attribute(node.value)
        items = np.asarray(value).ravel()
        position = -constant.value if negative else constant.value
        if not -items.size <= position < items.size:
            raise ExpressionError(
                f"'{name}' has {items.size} element(s); index {position} is out of range"
            )
        return _attribute_number(items[position], f"{name}[{position}]")

    def _variable(self, name: str) -> Any:
        if name in self._values:
            return self._values[name]
        if name in self._stack:
            chain = " → ".join([*self._stack[self._stack.index(name) :], name])
            raise ExpressionError(f"Variables refer to each other in a loop: {chain}")
        self._stack.append(name)
        try:
            value = self.visit(_parse(self.variables[name]).body)
        except ExpressionError as error:
            # Name the variable once, where the problem is.
            if self._stack[-1] == name and not error.message.startswith("In '"):
                raise ExpressionError(f"In '{name}': {error.message}") from error
            raise
        finally:
            self._stack.pop()
        self._values[name] = value
        return value

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
