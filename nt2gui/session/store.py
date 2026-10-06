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
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .schema import Session, SessionDocument, UiState, default_session
from ..errors import Conflict
from .files import migrate, write_json_atomic

logger = logging.getLogger(__name__)


class RevisionConflict(Conflict):
    """A write based on a stale revision; carries the current snapshot."""

    def __init__(self, snapshot: dict[str, Any]) -> None:
        super().__init__("Revision conflict", **snapshot)
        self.snapshot = snapshot


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

    def document(self) -> SessionDocument:
        """The current session as a saveable document (no revision)."""
        with self._lock:
            return SessionDocument.model_validate(
                {
                    "schemaVersion": self._session.schema_version,
                    "state": self._session.state.to_wire(),
                    "simulations": [s.to_wire() for s in self._session.simulations],
                }
            )

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
        if self._path is not None:
            write_json_atomic(self._path, session.to_wire())
