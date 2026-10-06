"""Templates: the session's panels, saved to be applied to any simulation."""

from flask import Blueprint, jsonify

from ..errors import UserError
from .common import json_object, require_text, workspace

bp = Blueprint("templates", __name__)


def _listing(templates):
    return jsonify({"templates": templates})


@bp.get("/templates")
def list_templates():
    return _listing(workspace().templates.summaries())


@bp.post("/templates")
def save_template():
    """Save the current panels (as the server has them) under `name`; 409
    if the name is taken, unless `overwrite`."""
    payload = json_object()
    name = require_text(payload, "name", "A template name is required")
    overwrite = payload.get("overwrite", False)
    if not isinstance(overwrite, bool):
        raise UserError("overwrite must be true or false")
    return _listing(workspace().save_template(name, overwrite))


@bp.patch("/templates/<name>")
def rename_template(name: str):
    new_name = require_text(json_object(), "name", "A template name is required")
    return _listing(workspace().templates.rename(name, new_name))


@bp.delete("/templates/<name>")
def remove_template(name: str):
    return _listing(workspace().templates.remove(name))


@bp.post("/templates/<name>/apply")
def apply_template(name: str):
    """Replace the panels with the template's, showing `simulationId` (or
    none when null); returns the session snapshot."""
    simulation_id = json_object().get("simulationId")
    if simulation_id is not None and not isinstance(simulation_id, str):
        raise UserError("simulationId must be a string or null")
    return jsonify(workspace().apply_template(name, simulation_id))
