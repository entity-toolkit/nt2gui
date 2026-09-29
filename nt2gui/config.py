"""Defaults and environment settings shared by the app and the CLI."""

import os
from pathlib import Path

STATE_FILE_ENV = "NT2GUI_STATE_FILE"
DEFAULT_STATE_FILE = Path(".nt2gui") / "session.json"
# The built client (`npm run build`), bundled into the wheel as package data.
STATIC_DIR = Path(__file__).resolve().parent / "static"


def state_file(explicit: Path | str | None = None) -> Path:
    """The session file: `explicit`, else $NT2GUI_STATE_FILE, else the default."""
    return Path(explicit or os.environ.get(STATE_FILE_ENV, DEFAULT_STATE_FILE))
