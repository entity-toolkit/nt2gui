"""The Flask app: the JSON API under `/api` and (optionally) the built client at `/`."""

import logging
import time
from collections.abc import Iterable
from pathlib import Path

from flask import Flask, Response, g, jsonify, request

from . import config
from .api import create_api
from .api.common import EXTENSION_KEY
from .errors import UserError
from .session.store import SessionStore
from .session.templates import TemplateStore
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
    app.extensions[EXTENSION_KEY] = Workspace(
        SessionStore(path), TemplateStore(config.templates_file(path))
    )

    @app.errorhandler(UserError)
    def user_error(error: UserError):
        return jsonify({"error": error.message, **error.extra}), error.status

    app.register_blueprint(create_api(), url_prefix="/api")
    log_slow_requests(app)
    allow_cross_origin(app, allowed_origins)
    if with_client:
        serve_client(app, static_dir)
    return app


# API requests slower than this are logged, to show where time goes.
SLOW_REQUEST_SECONDS = 0.5


def log_slow_requests(app: Flask) -> None:
    @app.before_request
    def start_timer() -> None:
        g.request_started = time.perf_counter()

    @app.after_request
    def report(response: Response) -> Response:
        started = g.get("request_started")
        if started is not None and request.path.startswith("/api/"):
            elapsed = time.perf_counter() - started
            if elapsed > SLOW_REQUEST_SECONDS:
                app.logger.info(
                    "slow request: %s %s took %.2fs", request.method, request.path, elapsed
                )
        return response


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
