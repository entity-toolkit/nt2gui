"""The server's live state: the persisted session plus the open simulations.

Requests are served from several threads. Commands that change which
simulations are open take `_lock`, so the registry and the session always
agree; readers never lock, and always see a complete registry because it is
swapped in whole rather than edited in place.
"""

import logging
import threading
from collections.abc import Iterable
from typing import Any

from .data.transforms import IDENTITY, Frame, TransformError, frame_timeline
from .errors import Conflict, NotFound, UserError
from .session.schema import (
    DEFAULT_TIMELINE,
    MAX_SIMULATION_NAME,
    Plotter,
    Session,
    SessionDocument,
    SimulationRecord,
    Timeline,
)
from .session.store import SessionStore
from .session.templates import (
    TemplateStore,
    apply_template,
    check_name,
    template_from_state,
)
from .sources import SimulationSource, open_simulation, spanning_timeline

logger = logging.getLogger(__name__)


class Workspace:
    def __init__(self, store: SessionStore, templates: TemplateStore | None = None) -> None:
        self.store = store
        self.templates = templates or TemplateStore(None)
        self._lock = threading.Lock()
        # Simulation data lives only in memory; the session records which
        # paths were open, so they are re-opened (same ids) on restart.
        opened, failed = _open_all(store.session.simulations)
        self._simulations: dict[str, SimulationSource] = opened
        for path, error in failed.values():
            logger.error("Could not re-open %s: %s", path, error)

        def tidy(session: Session) -> None:
            forget_simulations(session, set(failed))
            name_simulations(session, opened)

        if failed or any(record.name is None for record in store.session.simulations):
            store.update(tidy)

    def simulation(self, simulation_id: str) -> SimulationSource:
        simulation = self._simulations.get(simulation_id)
        if simulation is None:
            raise NotFound("Simulation not found")
        return simulation

    def all(self) -> list[SimulationSource]:
        """The open simulations, in the order they were loaded."""
        return list(self._simulations.values())

    def add(self, path: str) -> dict[str, Any]:
        """Open `path` (once); the global timeline grows to cover it too (the
        first simulation's starts at its first output)."""
        with self._lock:
            if any(sim.path == path for sim in self._simulations.values()):
                return self.store.snapshot()
            try:
                simulation = open_simulation(path)
            except Exception as error:  # loaders raise many kinds on bad data
                logger.error("Could not open %s: %s", path, error)
                raise UserError(f"Could not open {path}: {_message(error)}") from error

            def mutate(session: Session) -> None:
                taken = {record.name for record in session.simulations}
                session.simulations.append(
                    SimulationRecord(
                        id=simulation.id,
                        path=simulation.path,
                        name=unique_name(simulation.name, taken),
                    )
                )
                current = (
                    session.state.timeline.current if self._simulations else None
                )
                session.state.timeline = global_timeline(
                    session, [*self._simulations.values(), simulation], current
                )

            snapshot = self.store.update(mutate)
            self._simulations = {**self._simulations, simulation.id: simulation}
            return snapshot

    def rename(self, simulation_id: str, name: str) -> dict[str, Any]:
        """Give a loaded simulation a new display name (unique among them)."""
        name = name.strip()
        if not name:
            raise UserError("A simulation name is required")
        if len(name) > MAX_SIMULATION_NAME:
            raise UserError(
                f"Simulation names are at most {MAX_SIMULATION_NAME} characters"
            )
        with self._lock:
            self.simulation(simulation_id)
            session = self.store.session
            if any(
                record.name == name and record.id != simulation_id
                for record in session.simulations
            ):
                raise Conflict(f"Another simulation is already called '{name}'")

            def mutate(session: Session) -> None:
                for record in session.simulations:
                    if record.id == simulation_id:
                        record.name = name

            return self.store.update(mutate)

    def reload(self, simulation_id: str) -> dict[str, Any]:
        """Re-open a simulation from disk (same id and name), picking up new
        outputs; the global timeline is updated, keeping the current time
        where it still fits. Cached data of the old instance is dropped with it."""
        with self._lock:
            old = self.simulation(simulation_id)
            try:
                simulation = open_simulation(old.path, simulation_id)
            except Exception as error:  # the data may have moved or broken
                logger.error("Could not reload %s: %s", old.path, error)
                raise UserError(
                    f"Could not reload {old.path}: {_message(error)}"
                ) from error

            simulations = {**self._simulations, simulation_id: simulation}

            def mutate(session: Session) -> None:
                session.state.timeline = global_timeline(
                    session, simulations.values(), session.state.timeline.current
                )

            snapshot = self.store.update(mutate)
            self._simulations = simulations
            return snapshot

    def save_template(self, name: str, overwrite: bool = False) -> list[dict[str, Any]]:
        """Save the current panels as template `name`."""
        template = template_from_state(self.store.session.state, check_name(name))
        return self.templates.save(template, overwrite)

    def apply_template(self, name: str, simulation_id: str | None) -> dict[str, Any]:
        """Replace the panels with template `name`'s, showing `simulation_id`."""
        template = self.templates.get(name)
        with self._lock:
            if simulation_id is not None:
                self.simulation(simulation_id)
            return self.store.update(
                lambda session: apply_template(session.state, template, simulation_id)
            )

    def remove(self, simulation_id: str) -> dict[str, Any]:
        with self._lock:
            self.simulation(simulation_id)
            remaining = {
                key: sim
                for key, sim in self._simulations.items()
                if key != simulation_id
            }

            def mutate(session: Session) -> None:
                forget_simulations(session, {simulation_id})
                if remaining:
                    session.state.timeline = global_timeline(
                        session, remaining.values(), session.state.timeline.current
                    )

            snapshot = self.store.update(mutate)
            self._simulations = remaining
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
                name_simulations(session, opened)

            snapshot = self.store.update(mutate)
            self._simulations = opened
            warnings = [
                f"Could not open simulation {path}: {error}"
                for path, error in failed.values()
            ]
            return {**snapshot, "warnings": warnings}


def _timeline(simulation: SimulationSource, session: Session) -> dict[str, float]:
    """The simulation's timeline in the session's transformed time; its own
    if the transforms don't work for it (the plots will say why)."""
    state = session.state
    frame = (
        Frame(state.coordinate_transforms, simulation.attrs, state.time_axis)
        if state.coordinate_transforms
        else IDENTITY
    )
    try:
        return frame_timeline(simulation, frame)
    except TransformError as error:
        logger.warning("Untransformed timeline for %s: %s", simulation.path, error)
        return simulation.timeline


def global_timeline(
    session: Session, simulations: Iterable[SimulationSource], current: float | None
) -> Timeline:
    """The timeline spanning every simulation's outputs (their times are
    assumed to share units), at `current` (kept inside it) or its start."""
    timeline = Timeline.model_validate(
        spanning_timeline([_timeline(sim, session) for sim in simulations])
    )
    if current is not None:
        timeline.current = min(max(current, timeline.min), timeline.max)
    return timeline


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


def unique_name(base: str, taken: set[str | None]) -> str:
    """`base`, or `base-01`, `base-02`, … if that is taken."""
    if base not in taken:
        return base
    index = 1
    while f"{base}-{index:02d}" in taken:
        index += 1
    return f"{base}-{index:02d}"


def name_simulations(session: Session, sources: dict[str, SimulationSource]) -> None:
    """Give unnamed simulations (from sessions saved before names existed)
    their run's name, kept unique."""
    taken = {record.name for record in session.simulations}
    for record in session.simulations:
        if record.name is None:
            source = sources.get(record.id)
            record.name = unique_name(source.name if source else record.path, taken)
            taken.add(record.name)


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
