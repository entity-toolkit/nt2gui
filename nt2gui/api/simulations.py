"""Opening and closing simulations, and what each contains."""

from flask import Blueprint, jsonify

from ..data.metadata import summarize
from .common import json_object, require_text, simulation, workspace

bp = Blueprint("simulations", __name__)


@bp.post("/simulations")
def add_simulation():
    path = require_text(json_object(), "path", "Simulation path is required")
    return jsonify(workspace().add(path))


@bp.delete("/simulations/<simulation_id>")
def remove_simulation(simulation_id: str):
    return jsonify(workspace().remove(simulation_id))


@bp.get("/simulations/<simulation_id>/summary")
def get_summary(simulation_id: str):
    return jsonify(summarize(simulation(simulation_id)))
