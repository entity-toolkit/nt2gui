"""Particle metadata, custom-quantity checks, and particle plots."""

from flask import Blueprint, jsonify

from ..data.metadata import particle_metadata
from ..data.particles import particle_dataset, quantity_values
from ..errors import UserError
from ..plots.particle_histogram import render_particle_histogram
from ..plots.particle_phase import render_particle_phase
from ..session.schema import ParticleHistogramConfig, ParticlePhaseConfig
from ..sources import first_particles
from .common import (
    json_object,
    parse,
    particles_at,
    require_text,
    require_time,
    simulation,
)

bp = Blueprint("particles", __name__, url_prefix="/simulations/<simulation_id>")

# Expressions are checked on a few particles; validity doesn't depend on values.
CHECK_SAMPLE_SIZE = 16


@bp.get("/particles")
def get_particles(simulation_id: str):
    return jsonify(particle_metadata(simulation(simulation_id)))


@bp.post("/particles/check")
def check_particle_quantity(simulation_id: str):
    source = simulation(simulation_id)
    expression = require_text(json_object(), "expression", "An expression is required")
    if not source.species:
        raise UserError("This simulation has no particle output")
    sample = particle_dataset(first_particles(source).head(CHECK_SAMPLE_SIZE))
    quantity_values(expression, sample)
    return jsonify({"expression": expression})


@bp.post("/render/particles/histogram")
def histogram_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(ParticleHistogramConfig, payload.get("config"), "histogram request")
    particles, timestamp = particles_at(source, time)
    return jsonify(
        {**render_particle_histogram(particles, config), "timestamp": timestamp}
    )


@bp.post("/render/particles/phase")
def phase_plot(simulation_id: str):
    source = simulation(simulation_id)
    payload = json_object()
    time = require_time(payload)
    config = parse(ParticlePhaseConfig, payload.get("config"), "phase-space request")
    particles, timestamp = particles_at(source, time)
    return jsonify({**render_particle_phase(particles, config), "timestamp": timestamp})
