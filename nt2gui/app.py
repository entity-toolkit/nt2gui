"""The Flask app: the JSON API under `/api` and the built client at `/`."""

import logging
from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from . import config
from .api import create_api
from .api.common import EXTENSION_KEY
from .errors import UserError
from .session.store import SessionStore
from .workspace import Workspace


def create_app(
    state_file: Path | str | None = None, static_dir: Path | str | None = None
) -> Flask:
    """`state_file` defaults to $NT2GUI_STATE_FILE, then `.nt2gui/session.json`
    in the working directory; `static_dir` defaults to the bundled client."""
    app = Flask(__name__, static_folder=None)
    app.logger.setLevel(logging.INFO)

    path = config.state_file(state_file)
    app.logger.info("Session file: %s", path.resolve())
    app.extensions[EXTENSION_KEY] = Workspace(SessionStore(path))

    @app.errorhandler(UserError)
    def user_error(error: UserError):
        return jsonify({"error": error.message, **error.extra}), error.status

    app.register_blueprint(create_api(), url_prefix="/api")
    _serve_client(app, Path(static_dir) if static_dir else config.STATIC_DIR)
    return app


def _serve_client(app: Flask, static_dir: Path) -> None:
    """Serve the single-page client. Asset URLs are relative (vite `base: "./"`)
    so the app also works behind a path-prefixing proxy."""

    @app.get("/")
    @app.get("/<path:filename>")
    def client(filename: str = "index.html"):
        if not (static_dir / "index.html").is_file():
            return (
                "The nt2gui client is not built. Run `npm run build`, or use "
                "`npm run dev` for development.",
                404,
                {"Content-Type": "text/plain; charset=utf-8"},
            )
        return send_from_directory(static_dir, filename)
