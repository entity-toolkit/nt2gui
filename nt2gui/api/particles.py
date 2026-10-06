"""Particle metadata, custom-quantity checks, and particle plots."""

from flask import Blueprint, jsonify

from ..data.metadata import particle_metadata
from ..data.particles import quantity_values, sample_dataset
from ..errors import UserError
from ..plots.particle_histogram import render_particle_histogram
from ..plots.particle_phase import render_particle_phase
from ..data.regions import region_coordinates, resolve_regions
from ..session.schema import ParticleHistogramConfig, ParticlePhaseConfig, Region
from .common import (
    json_object,
    parse,
    particles_at,
    require_text,
    require_time,
    simulation,
)

bp = Blueprint("particles", __name__, url_prefix="/simulations/<simulation_id>")


def request_regions(payload: dict) -> dict[str, Region]:
    """The region definitions sent with a render request, by name. The client
    sends them (rather than the server reading its session) so a render never
    races the debounced state sync."""
    raw = payload.get("regions", [])
    if not isinstance(raw, list):
        raise UserError("regions must be a list")
    regions = [parse(Region, item, "region") for item in raw]
    return {region.name: region for region in regions}


@bp.get("/particles")
def get_particles(simulation_id: str):
    return jsonify(particle_metadata(simulation(simulation_id)))


@bp.post("/particles/check")
def check_particle_quantity(simulation_id: str):
    source = simulation(simulation_id)
    expression = require_text(json_object(), "expression", "An expression is required")
    if not source.species:
        raise UserError("This simulation has no particle output")
    # Validity doesn't depend on the values: check on zeros, read nothing.
    quantity_values(expression, sample_dataset(source.particle_columns))
    return jsonify({"expression": expression})


@bp.post("/render/particles/histogram")
def histogram_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(ParticleHistogramConfig, payload.get("config"), "histogram request")
    regions = request_regions(payload)
    used = resolve_regions((n for s in config.series for n in s.regions), regions)
    particles, timestamp = particles_at(
        source, time, [config.x.quantity, *region_coordinates(used)]
    )
    return jsonify(
        {
            **render_particle_histogram(particles, config, regions),
            "timestamp": timestamp,
        }
    )


@bp.post("/render/particles/phase")
def phase_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(ParticlePhaseConfig, payload.get("config"), "phase-space request")
    regions = request_regions(payload)
    used = resolve_regions(config.regions, regions)
    particles, timestamp = particles_at(
        source,
        time,
        [config.x.quantity, config.y.quantity, *region_coordinates(used)],
    )
    return jsonify(
        {**render_particle_phase(particles, config, regions), "timestamp": timestamp}
    )
