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


# Memory each open simulation may use to keep data read from disk, per kind.
# Re-reading is what makes a plot slow (nt2py reads a whole field step at a
# time), so these trade memory for responsiveness.
FIELD_CACHE_ENV = "NT2GUI_FIELD_CACHE_MB"
PARTICLE_CACHE_ENV = "NT2GUI_PARTICLE_CACHE_MB"
DEFAULT_FIELD_CACHE_MB = 2048
DEFAULT_PARTICLE_CACHE_MB = 2048


def cache_bytes(env: str, default_mb: int) -> int:
    try:
        megabytes = float(os.environ.get(env, default_mb))
    except ValueError:
        megabytes = default_mb
    return int(max(megabytes, 0) * 1024**2)
