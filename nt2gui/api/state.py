"""The synced UI state, and saving/loading whole sessions."""

from flask import Blueprint, current_app, jsonify

from ..errors import Conflict, NotFound, UserError
from ..session.files import (
    parse_document,
    read_document,
    resolve_session_path,
    write_document,
)
from ..session.schema import UiState
from .common import json_object, parse, require_text, workspace

bp = Blueprint("state", __name__)


@bp.get("/state")
def get_state():
    return jsonify(workspace().store.snapshot())


@bp.put("/state")
def put_state():
    payload = json_object()
    revision = payload.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int):
        raise UserError("Expected {revision: int, state: object}")
    state = parse(UiState, payload.get("state"), "state")
    return jsonify(workspace().store.replace_state(state, revision))


@bp.get("/session/export")
def export_session():
    return jsonify(workspace().store.document().to_wire())


@bp.post("/session/import")
def import_session():
    try:
        document = parse_document(json_object().get("session"))
    except ValueError as error:
        raise UserError(f"Invalid session file: {error}") from error
    return jsonify(workspace().apply_document(document))


@bp.post("/session/save")
def save_session():
    payload = json_object()
    path = resolve_session_path(
        require_text(payload, "path", "A session file path is required")
    )
    try:
        write_document(
            path, workspace().store.document(), bool(payload.get("overwrite"))
        )
    except FileExistsError as error:
        raise Conflict("File already exists", path=str(path)) from error
    except OSError as error:
        raise UserError(f"Could not write {path}: {error.strerror or error}") from error
    current_app.logger.info("Session saved to %s", path)
    return jsonify({**workspace().store.snapshot(), "path": str(path)})


@bp.post("/session/load")
def load_session():
    path = resolve_session_path(
        require_text(json_object(), "path", "A session file path is required")
    )
    try:
        document = read_document(path)
    except FileNotFoundError as error:
        raise NotFound("File not found", path=str(path)) from error
    except ValueError as error:
        raise UserError(f"Invalid session file: {error}") from error
    except OSError as error:
        raise UserError(f"Could not read file: {error.strerror or error}") from error
    current_app.logger.info("Session loaded from %s", path)
    return jsonify({**workspace().apply_document(document), "path": str(path)})
