"""The server's live state: the persisted session plus the open simulations.

Requests are served from several threads. Commands that change which
simulations are open take `_lock`, so the registry and the session always
agree; readers never lock, and always see a complete registry because it is
swapped in whole rather than edited in place.
"""

import logging
import threading
from typing import Any

from .errors import NotFound, UserError
from .session.schema import (
    DEFAULT_TIMELINE,
    Plotter,
    Session,
    SessionDocument,
    SimulationRecord,
    Timeline,
)
from .session.store import SessionStore
from .sources import SimulationSource, open_simulation

logger = logging.getLogger(__name__)


class Workspace:
    def __init__(self, store: SessionStore) -> None:
        self.store = store
        self._lock = threading.Lock()
        # Simulation data lives only in memory; the session records which
        # paths were open, so they are re-opened (same ids) on restart.
        opened, failed = _open_all(store.session.simulations)
        self._simulations: dict[str, SimulationSource] = opened
        for path, error in failed.values():
            logger.error("Could not re-open %s: %s", path, error)
        if failed:
            store.update(lambda session: forget_simulations(session, set(failed)))

    def simulation(self, simulation_id: str) -> SimulationSource:
        simulation = self._simulations.get(simulation_id)
        if simulation is None:
            raise NotFound("Simulation not found")
        return simulation

    def add(self, path: str) -> dict[str, Any]:
        """Open `path` (once) and make its timeline the global one."""
        with self._lock:
            if any(sim.path == path for sim in self._simulations.values()):
                return self.store.snapshot()
            try:
                simulation = open_simulation(path)
            except Exception as error:  # loaders raise many kinds on bad data
                logger.error("Could not open %s: %s", path, error)
                raise UserError(f"Could not open {path}: {_message(error)}") from error

            def mutate(session: Session) -> None:
                session.simulations.append(
                    SimulationRecord(id=simulation.id, path=simulation.path)
                )
                session.state.timeline = Timeline.model_validate(simulation.timeline)

            snapshot = self.store.update(mutate)
            self._simulations = {**self._simulations, simulation.id: simulation}
            return snapshot

    def remove(self, simulation_id: str) -> dict[str, Any]:
        with self._lock:
            self.simulation(simulation_id)
            snapshot = self.store.update(
                lambda session: forget_simulations(session, {simulation_id})
            )
            self._simulations = {
                key: sim
                for key, sim in self._simulations.items()
                if key != simulation_id
            }
            return snapshot

    def apply_document(self, document: SessionDocument) -> dict[str, Any]:
        """Replace the whole session with a saved one, re-opening its
        simulations (already open ones are reused)."""
        with self._lock:
            opened, failed = _open_all(document.simulations, reuse=self._simulations)

            def mutate(session: Session) -> None:
                session.state = document.state.model_copy(deep=True)
                session.simulations = [r.model_copy() for r in document.simulations]
                if failed:
                    forget_simulations(session, set(failed))

            snapshot = self.store.update(mutate)
            self._simulations = opened
            warnings = [
                f"Could not open simulation {path}: {error}"
                for path, error in failed.values()
            ]
            return {**snapshot, "warnings": warnings}


def _open_all(
    records: list[SimulationRecord],
    reuse: dict[str, SimulationSource] | None = None,
) -> tuple[dict[str, SimulationSource], dict[str, tuple[str, str]]]:
    """Open every record; returns (opened by id, failed id -> (path, reason))."""
    opened: dict[str, SimulationSource] = {}
    failed: dict[str, tuple[str, str]] = {}
    for record in records:
        existing = (reuse or {}).get(record.id)
        if existing is not None and existing.path == record.path:
            opened[record.id] = existing
            continue
        try:
            opened[record.id] = open_simulation(record.path, record.id)
        except Exception as error:  # moved or deleted data
            failed[record.id] = (record.path, _message(error))
    return opened, failed


def forget_simulations(session: Session, ids: set[str]) -> None:
    """Drop simulations from the session and detach plots that used them."""
    session.simulations = [sim for sim in session.simulations if sim.id not in ids]
    plotters = session.state.plotters
    for panel_id, plotter in plotters.items():
        if plotter.simulation_id in ids:
            # Drop the field (rather than null it) to match the client's
            # optional `simulationId?: string`.
            wire = plotter.to_wire()
            wire.pop("simulationId")
            plotters[panel_id] = Plotter.model_validate(wire)
    if not session.simulations:
        session.state.timeline = Timeline.model_validate(DEFAULT_TIMELINE)


def _message(error: Exception) -> str:
    # KeyError's str() wraps the message in quotes.
    return str(error.args[0]) if error.args else str(error)
