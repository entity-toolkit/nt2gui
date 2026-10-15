"""Opening and closing simulations, and what each contains."""

from flask import Blueprint, jsonify

from ..data.metadata import simulation_attributes, summarize
from ..data.transforms import check_transforms, retimed
from ..errors import UserError
from .common import (
    frame_for,
    json_object,
    request_frame,
    require_text,
    require_time,
    simulation,
    workspace,
)

bp = Blueprint("simulations", __name__)


@bp.post("/simulations")
def add_simulation():
    path = require_text(json_object(), "path", "Simulation path is required")
    return jsonify(workspace().add(path))


@bp.patch("/simulations/<simulation_id>")
def rename_simulation(simulation_id: str):
    name = require_text(json_object(), "name", "A simulation name is required")
    return jsonify(workspace().rename(simulation_id, name))


@bp.delete("/simulations/<simulation_id>")
def remove_simulation(simulation_id: str):
    return jsonify(workspace().remove(simulation_id))


@bp.post("/simulations/<simulation_id>/reload")
def reload_simulation(simulation_id: str):
    return jsonify(workspace().reload(simulation_id))


@bp.get("/simulations/<simulation_id>/attrs")
def get_attributes(simulation_id: str):
    return jsonify({"attrs": simulation_attributes(simulation(simulation_id))})


@bp.get("/simulations/<simulation_id>/summary")
def get_summary(simulation_id: str):
    return jsonify(summarize(simulation(simulation_id)))


@bp.post("/simulations/<simulation_id>/transforms/check")
def check_simulation_transforms(simulation_id: str):
    """Does each of `transforms` work for this simulation, and what ranges
    does it give (see `check_transforms`)."""
    source = simulation(simulation_id)
    return jsonify(check_transforms(source, request_frame(source, json_object())))


@bp.post("/simulations/<simulation_id>/timeline")
def transformed_timeline(simulation_id: str):
    """This simulation's timeline under `transforms` and `timeAxis`, staying
    at the output nearest to `previous.time` under `previous.transforms` and
    `previous.timeAxis`."""
    source = simulation(simulation_id)
    payload = json_object()
    previous = payload.get("previous") or {}
    if not isinstance(previous, dict):
        raise UserError("previous must be an object")
    return jsonify(
        retimed(
            source,
            request_frame(source, payload),
            frame_for(source, previous.get("transforms"), previous.get("timeAxis")),
            require_time(previous) if "time" in previous else float("-inf"),
        )
    )
