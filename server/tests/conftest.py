import sys
from pathlib import Path

# The server modules import each other as top-level modules (as `flask --app
# server/index.py` runs them), so put the server directory on the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
