# nt2gui

A browser UI for visualizing [Entity](https://github.com/entity-toolkit/entity) simulation output, read with [nt2py](https://github.com/entity-toolkit/nt2py).

The server runs where the data lives (e.g. a cluster node), does all the data processing, and serves the UI. Your browser connects to it through an SSH tunnel, so nothing needs to be installed on your laptop.

## Usage

On the cluster:

```bash
python -m venv ~/nt2gui-env
~/nt2gui-env/bin/pip install nt2gui
~/nt2gui-env/bin/nt2gui serve            # --port, --host, --state-file, --threads
```

It prints the tunnel command to run on your machine, e.g.

```bash
ssh -N -L 8765:localhost:8765 you@node042      # add -J you@login-node if needed
```

then open <http://localhost:8765/>.

By default the server listens on `127.0.0.1` only. The UI session is saved to `.nt2gui/session.json` in the working directory (override with `--state-file` or `$NT2GUI_STATE_FILE`) and restored on restart.

## Development

```bash
pip install -r requirements.txt    # or: pip install -e ".[dev]"
npm i
npm run dev       # Flask on :5000 and vite with /api proxied to it
npm run test      # vitest + pytest
npm run package   # build the client into nt2gui/static, then the wheel/sdist into dist/
```
