"""Run nt2gui: the server next to the data, the UI in the user's browser.

  nt2gui serve    API and UI together (simplest: tunnel one port)
  nt2gui server   API only, e.g. on a cluster node
  nt2gui client   UI only, e.g. on your laptop, talking to a running server
"""

import argparse
import getpass
import logging
import socket
import sys
from pathlib import Path
from urllib.parse import quote

from . import __version__, config

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_CLIENT_PORT = 8766
LOOPBACK = ("127.0.0.1", "localhost", "::1")


def tunnel_hint(port: int, host: str, hostname: str, user: str) -> str:
    """The SSH command that makes `hostname:port` reachable as localhost:port."""
    if host in LOOPBACK:
        # Loopback is reachable only from `hostname` itself, so tunnel to it.
        command = f"ssh -N -L {port}:localhost:{port} {user}@{hostname}"
        note = f"(add `-J {user}@<login-node>` if {hostname} is behind a login node)"
    else:
        command = f"ssh -N -L {port}:{hostname}:{port} {user}@<login-node>"
        note = ""
    return "\n".join(
        ["From your machine, open a tunnel:", f"    {command}"]
        + ([f"    {note}"] if note else [])
    )


def serve_hint(port: int, host: str, hostname: str, user: str) -> str:
    return "\n".join(
        [
            f"nt2gui {__version__} serving on {hostname}:{port}",
            tunnel_hint(port, host, hostname, user),
            f"then browse to http://localhost:{port}/",
        ]
    )


def server_hint(
    port: int, host: str, hostname: str, user: str, origins: list[str]
) -> str:
    return "\n".join(
        [
            f"nt2gui {__version__} API serving on {hostname}:{port}",
            tunnel_hint(port, host, hostname, user),
            f"then run the UI there:  nt2gui client --server http://localhost:{port}",
            f"(browsers may call this API from: {', '.join(origins) or 'nowhere'})",
        ]
    )


def client_url(port: int, server: str) -> str:
    """The UI's address; `?server=` points it at the API (saved by the browser)."""
    return f"http://localhost:{port}/?server={quote(server, safe='')}"


def default_origins(client_port: int) -> list[str]:
    return [f"http://localhost:{client_port}", f"http://127.0.0.1:{client_port}"]


def _add_bind_options(parser: argparse.ArgumentParser, port: int) -> None:
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"Interface to bind (default: {DEFAULT_HOST}, reachable only "
        "from this machine; use an SSH tunnel).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=port,
        help=f"Port to listen on (default: {port}; 0 picks a free one).",
    )


def _add_api_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--state-file",
        type=Path,
        default=None,
        help=f"Where the UI session is persisted (default: ${config.STATE_FILE_ENV} "
        f"or {config.DEFAULT_STATE_FILE}).",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=8,
        help="Worker threads for concurrent requests (default: 8).",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nt2gui",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command", required=True)

    serve = commands.add_parser("serve", help="Run the API and the UI together.")
    _add_bind_options(serve, DEFAULT_PORT)
    _add_api_options(serve)

    server = commands.add_parser("server", help="Run only the API (no UI).")
    _add_bind_options(server, DEFAULT_PORT)
    _add_api_options(server)
    server.add_argument(
        "--allow-origin",
        action="append",
        default=None,
        metavar="ORIGIN",
        help="Web origin of a separately run UI allowed to use this API; "
        "repeatable, '*' allows any (default: the `nt2gui client` default, "
        f"http://localhost:{DEFAULT_CLIENT_PORT} and http://127.0.0.1:{DEFAULT_CLIENT_PORT}).",
    )

    client = commands.add_parser("client", help="Run only the UI, for a server elsewhere.")
    _add_bind_options(client, DEFAULT_CLIENT_PORT)
    client.add_argument(
        "--server",
        default=f"http://localhost:{DEFAULT_PORT}",
        help=f"URL of the nt2gui server (default: http://localhost:{DEFAULT_PORT}, "
        "e.g. through an SSH tunnel). It can also be changed in the UI's settings.",
    )
    return parser


def _run(app, host: str, port: int, threads: int, banner) -> None:
    # Imported here so `nt2gui --help` stays fast.
    from waitress import create_server

    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    # One process on purpose: open simulations, caches and the session live in
    # memory and must be shared by all requests.
    server = create_server(app, host=host, port=port, threads=threads)
    print(banner(getattr(server, "effective_port", port)), flush=True)
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    hostname, user = socket.gethostname(), getpass.getuser()

    if args.command == "client":
        from .static_client import create_client_app

        _run(
            create_client_app(),
            args.host,
            args.port,
            threads=4,
            banner=lambda port: f"nt2gui {__version__} UI on port {port}\n"
            f"open {client_url(port, args.server)}",
        )
        return 0

    from .app import create_app

    if args.command == "server":
        origins = args.allow_origin or default_origins(DEFAULT_CLIENT_PORT)
        app = create_app(args.state_file, with_client=False, allowed_origins=origins)
        banner = lambda port: server_hint(port, args.host, hostname, user, origins)
    else:
        app = create_app(args.state_file)
        banner = lambda port: serve_hint(port, args.host, hostname, user)
    _run(app, args.host, args.port, args.threads, banner)
    return 0


if __name__ == "__main__":
    sys.exit(main())
