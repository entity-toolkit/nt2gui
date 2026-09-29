import pytest

from nt2gui.app import create_app
from nt2gui.cli import build_parser, tunnel_hint


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
    hint = tunnel_hint(8765, "127.0.0.1", "node042", "me")
    assert "ssh -N -L 8765:localhost:8765 me@node042" in hint
    assert "http://localhost:8765/" in hint


def test_public_bind_hint_tunnels_through_a_login_node():
    hint = tunnel_hint(9000, "0.0.0.0", "node042", "me")
    assert "ssh -N -L 9000:node042:9000 me@<login-node>" in hint
