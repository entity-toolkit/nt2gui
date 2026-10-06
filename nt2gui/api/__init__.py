"""The JSON API, served under `/api`: one blueprint per area."""

from flask import Blueprint

from . import fields, particles, simulations, state, templates


def create_api() -> Blueprint:
    api = Blueprint("api", __name__)
    for area in (state, simulations, fields, particles, templates):
        api.register_blueprint(area.bp)
    return api
