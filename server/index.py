from typing import Any
import logging
from flask import Flask
from flask_cors import CORS
from flask import request, Response
import json
from model import Model


app = Flask(__name__)
app.logger.setLevel(logging.INFO)

cors = CORS(app, resources={r"/*": {"origins": "*"}})


state: dict[str, Any] = {"model": None}


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
