"""Serving the built single-page client (`npm run build` → nt2gui/static/).

Kept free of the data stack so `nt2gui client` starts instantly and runs
without simulation dependencies being importable.
"""

from pathlib import Path

from flask import Flask, send_from_directory

from . import config


def serve_client(app: Flask, static_dir: Path | str | None = None) -> None:
    """Serve the client at `/`. Asset URLs are relative (vite `base: "./"`) so
    it also works behind a path-prefixing proxy."""
    root = Path(static_dir) if static_dir else config.STATIC_DIR

    @app.get("/")
    @app.get("/<path:filename>")
    def client(filename: str = "index.html"):
        if not (root / "index.html").is_file():
            return (
                "The nt2gui client is not built. Run `npm run build`, or use "
                "`npm run dev` for development.",
                404,
                {"Content-Type": "text/plain; charset=utf-8"},
            )
        return send_from_directory(root, filename)


def create_client_app(static_dir: Path | str | None = None) -> Flask:
    """Only the client (no API): for running the UI on another machine than
    the server. The browser then reaches the server at the URL set in the
    client's settings."""
    app = Flask(__name__, static_folder=None)
    serve_client(app, static_dir)
    return app
