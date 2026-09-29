"""Reading and writing session documents (saved/exported sessions).

A session document is the persisted session minus its `revision`: the UI state
plus the simulations it refers to. The same format is used for files saved on
the server machine and for files downloaded to / uploaded from the client.
"""

import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ..errors import UserError
from .schema import SCHEMA_VERSION, SessionDocument

SESSION_SUFFIX = ".json"


def _v1_to_v2(raw: dict[str, Any]) -> dict[str, Any]:
    # v2 added 1D line plots and their per-axis synced zoom.
    state = raw.get("state")
    if isinstance(state, dict):
        state.setdefault("globalLineViewports", {})
    return raw


# schema_version -> function upgrading raw JSON from that version to the next.
MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {1: _v1_to_v2}


def migrate(raw: dict[str, Any]) -> dict[str, Any]:
    # Files written before versioning existed are v1.
    version = raw.get("schemaVersion", 1)
    if not isinstance(version, int):
        raise ValueError("schemaVersion must be an integer")
    if version > SCHEMA_VERSION:
        raise ValueError(
            f"session schema version {version} is newer than supported {SCHEMA_VERSION}"
        )
    while version < SCHEMA_VERSION:
        raw = MIGRATIONS[version](raw)
        version += 1
        raw["schemaVersion"] = version
    return raw


def parse_document(raw: Any) -> SessionDocument:
    """Validate a session document; raises ValueError if it is not one."""
    if not isinstance(raw, dict):
        raise ValueError("session document must be a JSON object")
    raw = migrate(dict(raw))
    # Accept the server's own session file too, whose revision is irrelevant here.
    raw.pop("revision", None)
    return SessionDocument.model_validate(raw)


def resolve_session_path(raw_path: str) -> Path:
    """Normalize a user-supplied path on the server machine.

    `~` is expanded, relative paths are resolved against the server's working
    directory, and a missing suffix becomes `.json`.
    """
    if not raw_path.strip():
        raise UserError("A session file path is required")
    path = Path(raw_path.strip()).expanduser()
    if not path.suffix:
        path = path.with_suffix(SESSION_SUFFIX)
    if path.suffix != SESSION_SUFFIX:
        raise UserError(f"Session files must end in {SESSION_SUFFIX}")
    return path.resolve()


def read_document(path: Path) -> SessionDocument:
    """Raises FileNotFoundError, IsADirectoryError, or ValueError."""
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise ValueError(f"not valid JSON: {error}") from error
    return parse_document(raw)


def write_document(path: Path, document: SessionDocument, overwrite: bool) -> None:
    """Raises FileExistsError unless `overwrite` is set."""
    if path.is_dir():
        raise IsADirectoryError(str(path))
    if path.exists() and not overwrite:
        raise FileExistsError(str(path))
    write_json_atomic(path, document.to_wire())


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write to a temp file in the same directory, then atomically swap it in,
    # so a crash mid-write never leaves a truncated file.
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as tmp:
            json.dump(data, tmp, indent=2)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise
