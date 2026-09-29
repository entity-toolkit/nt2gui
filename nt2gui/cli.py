"""`nt2gui serve`: run the server (API and bundled client) on this machine.

The server is meant to run next to the data (e.g. on a cluster node) while the
browser runs on the user's laptop, connected through an SSH tunnel.
"""

import argparse
import getpass
import logging
import socket
import sys
from pathlib import Path

from . import __version__

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765


def tunnel_hint(port: int, host: str, hostname: str, user: str) -> str:
    """How to reach a server on `hostname:port` from the user's machine."""
    if host in ("127.0.0.1", "localhost", "::1"):
        # Loopback is reachable only from `hostname` itself, so tunnel to it.
        command = f"ssh -N -L {port}:localhost:{port} {user}@{hostname}"
        note = f"(add `-J {user}@<login-node>` if {hostname} is behind a login node)"
    else:
        command = f"ssh -N -L {port}:{hostname}:{port} {user}@<login-node>"
        note = ""
    lines = [
        f"nt2gui {__version__} serving on {hostname}:{port}",
        "From your machine, open a tunnel:",
        f"    {command}",
        *([f"    {note}"] if note else []),
        f"then browse to http://localhost:{port}/",
    ]
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nt2gui", description=__doc__)
    parser.add_argument("--version", action="version", version=__version__)
    commands = parser.add_subparsers(dest="command", required=True)

    serve = commands.add_parser("serve", help="Run the nt2gui server.")
    serve.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"Interface to bind (default: {DEFAULT_HOST}, reachable only "
        "from this machine; use an SSH tunnel).",
    )
    serve.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to listen on (default: {DEFAULT_PORT}; 0 picks a free one).",
    )
    serve.add_argument(
        "--state-file",
        type=Path,
        default=None,
        help="Where the UI session is persisted (default: $NT2GUI_STATE_FILE "
        "or .nt2gui/session.json).",
    )
    serve.add_argument(
        "--threads",
        type=int,
        default=8,
        help="Worker threads for concurrent requests (default: 8).",
    )
    return parser


def serve(host: str, port: int, state_file: Path | None, threads: int) -> None:
    # Imported here so `nt2gui --help` stays fast.
    from waitress import create_server

    from .app import create_app

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    # One process on purpose: open simulations, caches and the session live in
    # memory and must be shared by all requests.
    server = create_server(create_app(state_file), host=host, port=port, threads=threads)
    effective_port = getattr(server, "effective_port", port)
    print(
        tunnel_hint(effective_port, host, socket.gethostname(), getpass.getuser()),
        flush=True,
    )
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "serve":
        serve(args.host, args.port, args.state_file, args.threads)
    return 0


if __name__ == "__main__":
    sys.exit(main())
