from flask import Flask
from flask_cors import CORS
from flask import request, Response
import json

app = Flask(__name__)

cors = CORS(app, resources={r"/*": {"origins": "*"}})


@app.route("/")
def hello_world():
    return json.dumps({"message": "works"})


@app.before_request
def basic_authentication():
    if request.method.lower() == "options":
        return Response()
