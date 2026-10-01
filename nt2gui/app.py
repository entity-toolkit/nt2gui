"""The Flask app: the JSON API under `/api` and (optionally) the built client at `/`."""

import logging
from collections.abc import Iterable
from pathlib import Path

from flask import Flask, Response, jsonify, request

from . import config
from .api import create_api
from .api.common import EXTENSION_KEY
from .errors import UserError
from .session.store import SessionStore
from .static_client import serve_client
from .workspace import Workspace


def create_app(
    state_file: Path | str | None = None,
    static_dir: Path | str | None = None,
    *,
    with_client: bool = True,
    allowed_origins: Iterable[str] = (),
) -> Flask:
    """`state_file` defaults to $NT2GUI_STATE_FILE, then `.nt2gui/session.json`
    in the working directory; `static_dir` defaults to the bundled client.

    `allowed_origins` are the web origins (e.g. "http://localhost:8766", or
    "*") of separately served clients allowed to call the API from a browser.
    """
    app = Flask(__name__, static_folder=None)
    app.logger.setLevel(logging.INFO)

    path = config.state_file(state_file)
    app.logger.info("Session file: %s", path.resolve())
    app.extensions[EXTENSION_KEY] = Workspace(SessionStore(path))

    @app.errorhandler(UserError)
    def user_error(error: UserError):
        return jsonify({"error": error.message, **error.extra}), error.status

    app.register_blueprint(create_api(), url_prefix="/api")
    allow_cross_origin(app, allowed_origins)
    if with_client:
        serve_client(app, static_dir)
    return app


def normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/").lower()


def allow_cross_origin(app: Flask, origins: Iterable[str]) -> None:
    """Let browsers on the given origins call the API (CORS).

    Only listed origins are allowed: the API can write files on this machine,
    so arbitrary websites must not be able to use it through the user's
    browser (e.g. via an SSH tunnel on localhost).
    """
    allowed = {normalize_origin(origin) for origin in origins}
    if not allowed:
        return

    @app.after_request
    def add_cors_headers(response: Response) -> Response:
        origin = request.headers.get("Origin")
        if not origin or not request.path.startswith("/api/"):
            return response
        if "*" not in allowed and normalize_origin(origin) not in allowed:
            return response
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Max-Age"] = "600"
        response.vary.add("Origin")
        return response
