"""Disk-backed, revisioned store for the UI session.

The server is the single source of truth: it always holds a valid session
(loaded from disk or freshly defaulted), so clients never have to initialize
it. Every accepted change bumps `revision`; writes carrying a stale revision are
rejected so a client that fell behind (another tab, a server restart that lost
state) re-syncs instead of overwriting newer state.
"""

import json
import logging
import os
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from schema import SCHEMA_VERSION, Session, UiState, default_session

logger = logging.getLogger(__name__)

# schema_version -> function upgrading raw JSON from that version to the next.
MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {}


class RevisionConflict(Exception):
    def __init__(self, snapshot: dict[str, Any]) -> None:
        super().__init__("revision conflict")
        self.snapshot = snapshot


def migrate(raw: dict[str, Any]) -> dict[str, Any]:
    version = raw.get("schemaVersion", SCHEMA_VERSION)
    if version > SCHEMA_VERSION:
        raise ValueError(
            f"session schema version {version} is newer than supported {SCHEMA_VERSION}"
        )
    while version < SCHEMA_VERSION:
        raw = MIGRATIONS[version](raw)
        version += 1
        raw["schemaVersion"] = version
    return raw


class SessionStore:
    def __init__(self, path: Path | None) -> None:
        """`path=None` keeps the session in memory only (nothing persisted)."""
        self._path = path
        self._lock = threading.Lock()
        self._session = self._load()

    @property
    def session(self) -> Session:
        return self._session.model_copy(deep=True)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return self._snapshot()

    def replace_state(self, state: UiState, base_revision: int) -> dict[str, Any]:
        """Replace the UI state if the client was up to date with the server."""
        with self._lock:
            if base_revision != self._session.revision:
                raise RevisionConflict(self._snapshot())
            session = self._session.model_copy(deep=True)
            session.state = state
            return self._commit(session)

    def update(self, mutate: Callable[[Session], None]) -> dict[str, Any]:
        """Apply a server-side change (e.g. loading a simulation) atomically."""
        with self._lock:
            session = self._session.model_copy(deep=True)
            mutate(session)
            # Re-validate: mutations bypass pydantic's assignment checks.
            session = Session.model_validate(session.to_wire())
            return self._commit(session)

    def _snapshot(self) -> dict[str, Any]:
        wire = self._session.to_wire()
        return {
            "revision": wire["revision"],
            "state": wire["state"],
            "simulations": wire["simulations"],
        }

    def _commit(self, session: Session) -> dict[str, Any]:
        session.revision = self._session.revision + 1
        self._save(session)
        self._session = session
        return self._snapshot()

    def _load(self) -> Session:
        if self._path is None or not self._path.exists():
            return default_session()
        try:
            raw = json.loads(self._path.read_text())
            return Session.model_validate(migrate(raw))
        except (OSError, ValueError) as error:
            # pydantic's ValidationError is a ValueError. Keep the unreadable
            # file for inspection rather than overwriting it on the next save.
            backup = self._path.with_suffix(self._path.suffix + ".corrupt")
            logger.error(
                "Could not load session from %s (%s); moved to %s and starting fresh",
                self._path,
                error,
                backup,
            )
            os.replace(self._path, backup)
            return default_session()

    def _save(self, session: Session) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file in the same directory, then atomically swap it in,
        # so a crash mid-write never leaves a truncated session file.
        fd, tmp_name = tempfile.mkstemp(
            dir=self._path.parent, prefix=self._path.name, suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w") as tmp:
                json.dump(session.to_wire(), tmp, indent=2)
                tmp.flush()
                os.fsync(tmp.fileno())
            os.replace(tmp_name, self._path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise
