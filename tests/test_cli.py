import pytest

from nt2gui.app import create_app
from nt2gui.cli import (
    build_parser,
    client_url,
    default_origins,
    serve_hint,
    server_hint,
    tunnel_hint,
)
from nt2gui.static_client import create_client_app


@pytest.fixture
def static_dir(tmp_path):
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><div id=root></div>")
    (root / "assets" / "app.js").write_text("console.log(1)")
    return root


def make_client(tmp_path, static_dir):
    app = create_app(tmp_path / "session.json", static_dir=static_dir)
    return app.test_client()


def test_serves_client_and_api_side_by_side(tmp_path, static_dir):
    client = make_client(tmp_path, static_dir)
    assert b"id=root" in client.get("/").data
    assert client.get("/assets/app.js").data == b"console.log(1)"
    assert client.get("/api/state").get_json()["revision"] == 0


def test_api_is_not_served_at_root(tmp_path, static_dir):
    client = make_client(tmp_path, static_dir)
    assert client.get("/state").status_code == 404
    assert client.put("/api/nope", json={}).status_code == 405


def test_missing_client_file_is_404(tmp_path, static_dir):
    assert make_client(tmp_path, static_dir).get("/missing.js").status_code == 404


def test_unbuilt_client_explains_how_to_build(tmp_path):
    response = make_client(tmp_path, tmp_path / "nowhere").get("/")
    assert response.status_code == 404
    assert "npm run build" in response.get_data(as_text=True)


def test_static_files_cannot_escape_the_directory(tmp_path, static_dir):
    (tmp_path / "secret.txt").write_text("secret")
    response = make_client(tmp_path, static_dir).get("/../secret.txt")
    assert response.status_code == 404


def test_serve_defaults_to_loopback():
    args = build_parser().parse_args(["serve"])
    assert (args.host, args.port) == ("127.0.0.1", 8765)


def test_loopback_hint_tunnels_to_the_server_host():
    hint = serve_hint(8765, "127.0.0.1", "node042", "me")
    assert "ssh -N -L 8765:localhost:8765 me@node042" in hint
    assert "http://localhost:8765/" in hint


def test_public_bind_hint_tunnels_through_a_login_node():
    hint = tunnel_hint(9000, "0.0.0.0", "node042", "me")
    assert "ssh -N -L 9000:node042:9000 me@<login-node>" in hint


# --- running API and UI separately ---------------------------------------------


ORIGIN = "http://localhost:8766"


def api_client(tmp_path, origins=(ORIGIN,)):
    app = create_app(tmp_path / "session.json", with_client=False, allowed_origins=origins)
    return app.test_client()


def test_server_and_client_commands_have_their_own_defaults():
    parser = build_parser()
    server = parser.parse_args(["server"])
    client = parser.parse_args(["client"])
    assert (server.host, server.port, server.allow_origin) == ("127.0.0.1", 8765, None)
    assert (client.host, client.port, client.server) == ("127.0.0.1", 8766, "http://localhost:8765")
    many = parser.parse_args(["server", "--allow-origin", "a", "--allow-origin", "b"])
    assert many.allow_origin == ["a", "b"]


def test_default_origins_are_the_local_client():
    assert default_origins(8766) == ["http://localhost:8766", "http://127.0.0.1:8766"]


def test_client_url_points_the_ui_at_the_server():
    assert client_url(8766, "http://localhost:8765") == (
        "http://localhost:8766/?server=http%3A%2F%2Flocalhost%3A8765"
    )


def test_server_hint_explains_how_to_start_the_ui():
    hint = server_hint(8765, "127.0.0.1", "node042", "me", [ORIGIN])
    assert "ssh -N -L 8765:localhost:8765 me@node042" in hint
    assert "nt2gui client --server http://localhost:8765" in hint
    assert ORIGIN in hint


def test_api_only_server_serves_no_ui(tmp_path):
    client = api_client(tmp_path)
    assert client.get("/").status_code == 404
    assert client.get("/api/state").status_code == 200


def test_ui_only_app_serves_no_api(static_dir):
    client = create_client_app(static_dir).test_client()
    assert b"id=root" in client.get("/").data
    assert client.get("/api/state").status_code == 404


def test_allowed_origin_may_call_the_api(tmp_path):
    response = api_client(tmp_path).get("/api/state", headers={"Origin": ORIGIN})
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert "Origin" in response.headers["Vary"]


def test_preflight_allows_writes_with_json(tmp_path):
    response = api_client(tmp_path).open(
        "/api/state",
        method="OPTIONS",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "PUT"},
    )
    assert response.status_code == 200
    assert "PUT" in response.headers["Access-Control-Allow-Methods"]
    assert response.headers["Access-Control-Allow-Headers"] == "Content-Type"


def test_other_origins_get_no_cors_headers(tmp_path):
    response = api_client(tmp_path).get(
        "/api/state", headers={"Origin": "https://evil.example"}
    )
    assert "Access-Control-Allow-Origin" not in response.headers


def test_origins_match_regardless_of_case_and_trailing_slash(tmp_path):
    client = api_client(tmp_path, origins=["HTTP://LOCALHOST:8766/"])
    response = client.get("/api/state", headers={"Origin": ORIGIN})
    assert response.headers["Access-Control-Allow-Origin"] == ORIGIN


def test_wildcard_allows_any_origin(tmp_path):
    response = api_client(tmp_path, origins=["*"]).get(
        "/api/state", headers={"Origin": "https://anywhere.example"}
    )
    assert response.headers["Access-Control-Allow-Origin"] == "https://anywhere.example"


def test_serve_mode_allows_no_cross_origin_calls(tmp_path, static_dir):
    response = make_client(tmp_path, static_dir).get(
        "/api/state", headers={"Origin": ORIGIN}
    )
    assert "Access-Control-Allow-Origin" not in response.headers
