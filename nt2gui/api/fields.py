"""Field metadata, custom-quantity checks, and field plots."""

import json

from flask import Blueprint, jsonify, request

from ..data.metadata import field_metadata
from ..data.quantities import quantity_dims
from ..plots.line import render_line
from ..plots.pseudocolor import render_pseudocolor
from ..session.schema import LineConfig, PseudocolorConfig, Range, ZoomWindow
from ..errors import UserError
from .common import (
    frame_for,
    json_object,
    parse,
    request_frame,
    request_variables,
    require_text,
    require_time,
    simulation,
)

bp = Blueprint("fields", __name__, url_prefix="/simulations/<simulation_id>")


@bp.get("/fields")
def get_fields(simulation_id: str):
    """Field metadata; `?transforms=<json>&time=<t>` gives coordinates in the
    session's transformed units (at that time, for a moving frame)."""
    source = simulation(simulation_id)
    try:
        transforms = json.loads(request.args.get("transforms", "null"))
        time = request.args.get("time")
        time = float(time) if time is not None else None
    except ValueError as error:
        raise UserError("transforms must be JSON and time a number") from error
    return jsonify(field_metadata(source.fields, frame_for(source, transforms), time))


@bp.post("/quantities/check")
def check_quantity(simulation_id: str):
    """Validate a field name or expression and report its spatial dims."""
    source = simulation(simulation_id)
    payload = json_object()
    expression = require_text(payload, "expression", "An expression is required")
    dims = quantity_dims(expression, source.fields, request_variables(payload))
    return jsonify({"expression": expression, "dims": dims})


@bp.post("/render/line")
def line_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(LineConfig, payload.get("config"), "line plot request")
    value_range = (
        parse(Range, payload["range"], "zoom range").to_wire()
        if payload.get("range") is not None
        else None
    )
    fields = source.fields
    return jsonify(
        render_line(
            fields,
            config.quantities,
            config.axis,
            config.slices,
            time,
            value_range,
            smoothing=config.smoothing,
            variables=request_variables(payload),
            frame=request_frame(source, payload),
        )
    )


@bp.post("/render/pseudocolor")
def pseudocolor_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(PseudocolorConfig, payload.get("config"), "pseudocolor request")
    viewport = (
        parse(ZoomWindow, payload["viewport"], "zoom window")
        if payload.get("viewport") is not None
        else None
    )
    return jsonify(
        render_pseudocolor(
            source.fields,
            config,
            time,
            viewport,
            variables=request_variables(payload),
            frame=request_frame(source, payload),
        )
    )
