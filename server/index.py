import json
import logging
import os
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from pydantic import ValidationError

from fakeloader import Simulation
from fields import field_metadata, render_line
from schema import (
    DEFAULT_TIMELINE,
    LineConfig,
    Plotter,
    Range,
    Session,
    SessionDocument,
    SimulationRecord,
    Timeline,
    UiState,
)
from session_files import (
    parse_document,
    read_document,
    resolve_session_path,
    write_document,
)
from session_store import RevisionConflict, SessionStore

DEFAULT_STATE_FILE = Path(".nt2gui") / "session.json"


def _error(message: str, status: int, **extra: Any):
    return jsonify({"error": message, **extra}), status


def create_app(state_file: Path | str | None = None) -> Flask:
    """Build the app. `state_file` defaults to $NT2GUI_STATE_FILE, then
    `.nt2gui/session.json` in the working directory."""
    app = Flask(__name__)
    app.logger.setLevel(logging.INFO)
    CORS(app, resources={r"/*": {"origins": "*"}})

    path = Path(state_file or os.environ.get("NT2GUI_STATE_FILE", DEFAULT_STATE_FILE))
    store = SessionStore(path)
    app.logger.info("Session file: %s", path.resolve())

    # Loaded simulation data lives only in memory; the session records which
    # paths were open so they are re-opened (with the same ids) on restart.
    simulations: dict[str, Simulation] = {}
    failed: list[str] = []
    for record in store.session.simulations:
        try:
            simulations[record.id] = Simulation(record.path, record.id)
        except Exception as error:  # a real loader may fail on moved/deleted data
            app.logger.error("Could not re-open %s: %s", record.path, error)
            failed.append(record.id)
    if failed:
        store.update(lambda session: _forget_simulations(session, set(failed)))

    @app.get("/state")
    def get_state():
        return jsonify(store.snapshot())

    @app.put("/state")
    def put_state():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(
            payload.get("revision"), int
        ):
            return _error("Expected {revision: int, state: object}", 400)
        try:
            state = UiState.model_validate(payload.get("state"))
        except ValidationError as error:
            return _error("Invalid state", 400, details=json.loads(error.json(include_url=False)))
        try:
            return jsonify(store.replace_state(state, payload["revision"]))
        except RevisionConflict as conflict:
            return _error("Revision conflict", 409, **conflict.snapshot)

    @app.post("/simulations")
    def add_simulation():
        payload = request.get_json(silent=True) or {}
        sim_path = payload.get("path")
        if not isinstance(sim_path, str) or not sim_path.strip():
            return _error("Simulation path is required", 400)
        sim_path = sim_path.strip()

        if any(sim.path == sim_path for sim in simulations.values()):
            return jsonify(store.snapshot())

        simulation = Simulation(sim_path)

        def mutate(session: Session) -> None:
            session.simulations.append(
                SimulationRecord(id=simulation.id, path=simulation.path)
            )
            session.state.timeline = Timeline.model_validate(simulation.timeline)

        snapshot = store.update(mutate)
        simulations[simulation.id] = simulation
        return jsonify(snapshot)

    @app.delete("/simulations/<simulation_id>")
    def unload_simulation(simulation_id: str):
        if simulation_id not in simulations:
            return _error("Simulation not found", 404)
        snapshot = store.update(
            lambda session: _forget_simulations(session, {simulation_id})
        )
        del simulations[simulation_id]
        return jsonify(snapshot)

    def apply_document(document: SessionDocument) -> dict[str, Any]:
        """Replace the whole session with a saved one, re-opening its simulations."""
        opened: dict[str, Simulation] = {}
        warnings: list[str] = []
        for record in document.simulations:
            existing = simulations.get(record.id)
            if existing is not None and existing.path == record.path:
                opened[record.id] = existing
                continue
            try:
                opened[record.id] = Simulation(record.path, record.id)
            except Exception as error:
                warnings.append(f"Could not open simulation {record.path}: {error}")
        failed = {record.id for record in document.simulations} - opened.keys()

        def mutate(session: Session) -> None:
            session.state = document.state.model_copy(deep=True)
            session.simulations = [
                record.model_copy() for record in document.simulations
            ]
            if failed:
                _forget_simulations(session, failed)

        snapshot = store.update(mutate)
        simulations.clear()
        simulations.update(opened)
        return {**snapshot, "warnings": warnings}

    def session_path_from(payload: dict[str, Any]) -> Path:
        raw_path = payload.get("path")
        if not isinstance(raw_path, str):
            raise ValueError("path is required")
        return resolve_session_path(raw_path)

    @app.get("/session/export")
    def export_session():
        return jsonify(store.document().to_wire())

    @app.post("/session/import")
    def import_session():
        payload = request.get_json(silent=True) or {}
        try:
            document = parse_document(payload.get("session"))
        except ValueError as error:
            return _error(f"Invalid session file: {error}", 400)
        return jsonify(apply_document(document))

    @app.post("/session/save")
    def save_session():
        payload = request.get_json(silent=True) or {}
        try:
            path = session_path_from(payload)
        except ValueError as error:
            return _error(str(error), 400)
        try:
            write_document(path, store.document(), bool(payload.get("overwrite")))
        except FileExistsError:
            return _error("File already exists", 409, path=str(path))
        except OSError as error:
            return _error(f"Could not write {path}: {error.strerror or error}", 400)
        app.logger.info("Session saved to %s", path)
        return jsonify({**store.snapshot(), "path": str(path)})

    @app.post("/session/load")
    def load_session():
        payload = request.get_json(silent=True) or {}
        try:
            path = session_path_from(payload)
            document = read_document(path)
        except FileNotFoundError:
            return _error("File not found", 404, path=str(path))
        except ValueError as error:
            return _error(f"Invalid session file: {error}", 400)
        except OSError as error:
            return _error(f"Could not read file: {error.strerror or error}", 400)
        app.logger.info("Session loaded from %s", path)
        return jsonify({**apply_document(document), "path": str(path)})

    @app.get("/simulations/<simulation_id>/fields")
    def get_fields(simulation_id: str):
        simulation = simulations.get(simulation_id)
        if simulation is None:
            return _error("Simulation not found", 404)
        return jsonify(field_metadata(simulation.fields))

    @app.post("/simulations/<simulation_id>/render/line")
    def render_line_plot(simulation_id: str):
        simulation = simulations.get(simulation_id)
        if simulation is None:
            return _error("Simulation not found", 404)

        payload = request.get_json(silent=True) or {}
        time_value = payload.get("time")
        if not isinstance(time_value, (int, float)):
            return _error("Time value is required", 400)
        try:
            config = LineConfig.model_validate(payload.get("config"))
            value_range = (
                Range.model_validate(payload["range"]).to_wire()
                if payload.get("range") is not None
                else None
            )
            return jsonify(
                render_line(
                    simulation.fields,
                    config.quantities,
                    config.axis,
                    config.slices,
                    float(time_value),
                    value_range,
                )
            )
        except ValidationError as error:
            return _error("Invalid line plot request", 400, details=json.loads(error.json(include_url=False)))
        except (KeyError, ValueError) as error:
            # KeyError's str() wraps the message in quotes.
            message = error.args[0] if error.args else str(error)
            return _error(str(message), 400)

    @app.post("/simulations/<simulation_id>/render/pseudocolor")
    def render_pseudocolor(simulation_id: str):
        simulation = simulations.get(simulation_id)
        if simulation is None:
            return _error("Simulation not found", 404)

        payload = request.get_json(silent=True) or {}
        time_value = payload.get("time")
        if time_value is None:
            return _error("Time value is required", 400)

        try:
            return jsonify(
                simulation.render_pseudocolor(
                    payload.get("config", {}), float(time_value), payload.get("viewport")
                )
            )
        except (KeyError, ValueError) as error:
            app.logger.error("Failed to render pseudocolor: %s", error)
            return _error(str(error), 400)

    return app


def _forget_simulations(session: Session, ids: set[str]) -> None:
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
