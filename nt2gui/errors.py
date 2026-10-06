"""Errors that are the request's fault, as opposed to bugs.

Domain code raises `UserError` (or a subclass) for bad input — an unknown
quantity, an invalid expression, an empty zoom range — and the API turns it
into a JSON error with `status`. Anything else escaping a route is a bug and
becomes a 500.
"""

from typing import Any


class UserError(ValueError):
    status = 400

    def __init__(self, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.message = message
        # Extra JSON fields for the response (e.g. `path`, `details`).
        self.extra = extra


class NotFound(UserError):
    status = 404


class Conflict(UserError):
    status = 409
