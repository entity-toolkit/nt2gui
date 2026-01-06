from typing import Any
import logging
from flask import Flask
from flask_cors import CORS
from flask import request, Response
import json
from model import Model
from fakeloader import Simulation


app = Flask(__name__)
app.logger.setLevel(logging.INFO)

cors = CORS(app, resources={r"/*": {"origins": "*"}})


state: dict[str, Any] = {"model": None, "simulations": []}


def serialize_simulations() -> list[dict[str, str]]:
    return [simulation.to_json() for simulation in state["simulations"]]


def get_model() -> Model:
    if state["model"] is None:
        state["model"] = Model()
    return state["model"]


def get_simulation(simulation_id: str) -> Simulation | None:
    for simulation in state["simulations"]:
        if simulation.id == simulation_id:
            return simulation
    return None


def current_timeline() -> dict[str, Any]:
    return get_model().get_timeline()


def load_simulation(path: str) -> dict[str, Any]:
    if any(simulation.path == path for simulation in state["simulations"]):
        app.logger.info("Simulation already loaded: %s", path)
        return {
            "message": "Simulation already loaded",
            "simulations": serialize_simulations(),
            "timeline": get_model().get_timeline(),
        }

    simulation = Simulation(path)
    state["simulations"].append(simulation)

    model = get_model()
    model.set_timeline(simulation.timeline)

    return {
        "message": "Simulation added",
        "simulations": serialize_simulations(),
        "timeline": model.get_timeline(),
    }


@app.route("/")
def hello_world():
    if state["model"] is None:
        return Response("Model not initialized", status=500)
    return json.dumps({"message": state["model"].to_json()})


@app.route("/model_init", methods=["GET", "POST"])
def init_model():
    if request.method == "GET":
        return json.dumps(
            {
                "message": (
                    "Model initialized" if state["model"] else "Model not initialized"
                ),
                "model": state["model"].to_json() if state["model"] else None,
            }
        )

    if state["model"] is not None:
        app.logger.info("Model already initialized")
        return json.dumps(
            {
                "message": "Model already initialized",
                "model": state["model"].to_json(),
            }
        )
    else:
        payload = request.json or {}
        data = payload.get("model", {})
        if not data:
            app.logger.info("No model data provided, initializing empty model")
        state["model"] = Model().from_json(data)
        return json.dumps(
            {
                "message": "Model initialized",
                "model": state["model"].to_json(),
            }
        )


@app.route("/model_sync", methods=["POST"])
def sync_model():
    payload = request.json or {}
    data = payload.get("model", {})
    if state["model"] is None:
        app.logger.error("Attempted to sync before initialization")
        return Response("Model not initialized", status=500)
    state["model"] = Model().from_json(data)
    return json.dumps(
        {
            "message": "Model synchronized",
            "model": state["model"].to_json(),
        }
    )


@app.route("/simulations", methods=["GET", "POST"])
def manage_simulations():
    if request.method == "GET":
        return json.dumps(
            {"simulations": serialize_simulations(), "timeline": current_timeline()}
        )

    payload = request.json or {}
    path = payload.get("path")
    if not path:
        return Response("Simulation path is required", status=400)

    return json.dumps(load_simulation(path))


@app.route("/simulations/<simulation_id>", methods=["DELETE"])
def unload_simulation(simulation_id: str):
    simulations = state["simulations"]
    for index, simulation in enumerate(simulations):
        if simulation.id == simulation_id:
            simulations.pop(index)
            if not simulations:
                get_model().set_timeline(get_model().default_timeline)
            return json.dumps(
                {
                    "message": "Simulation removed",
                    "simulations": serialize_simulations(),
                    "timeline": current_timeline(),
                }
            )

    return Response("Simulation not found", status=404)


@app.route("/simulations/<simulation_id>/render/pseudocolor", methods=["POST"])
def render_pseudocolor(simulation_id: str):
    simulation = get_simulation(simulation_id)
    if simulation is None:
        return Response("Simulation not found", status=404)

    payload = request.json or {}
    config = payload.get("config", {})
    time_value = payload.get("time")
    viewport = payload.get("viewport")

    if time_value is None:
        return Response("Time value is required", status=400)

    try:
        render_result = simulation.render_pseudocolor(
            config, float(time_value), viewport
        )
    except (KeyError, ValueError) as error:
        app.logger.error("Failed to render pseudocolor: %s", error)
        return Response(str(error), status=400)

    return json.dumps(render_result)


# @app.route("/get_model")
# def get_model():
#     return json.dumps(model.to_json())


# @app.route("/add_tab", methods=["POST"])
# def add_tab():
#     data = request.json
#     tabset_id = data.get("tabset_id")
#     tab_id = data.get("tab_id")
#     tab_name = data.get("tab_name")
#     tab_component = data.get("tab_component")
#
#     tabset_node = model.root.get_child(tabset_id)
#     if not isinstance(tabset_node, TabsetNode):
#         return Response("Tabset not found", status=404)
#
#     new_tab = TabNode(tab_id, tab_name, tab_component)
#     tabset_node.add_child(new_tab)
#
#     return json.dumps({"message": "Tab added successfully", "tab": new_tab.to_json()})


@app.before_request
def basic_authentication():
    if request.method.lower() == "options":
        return Response()
