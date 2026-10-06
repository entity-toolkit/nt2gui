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

### Running the server and the UI separately

You can also serve only the API on the cluster and run the UI from the package on your own machine:

```bash
# on the cluster
nt2gui server          # API only; --allow-origin ORIGIN (repeatable) for UIs on other ports/hosts
# on your machine, with the tunnel above open
pip install nt2gui
nt2gui client          # UI only on http://localhost:8766; --server URL (default http://localhost:8765)
```

`nt2gui client` prints a link that points the UI at the server; you can change the server any time under **Settings → Server URL** (remembered by your browser). For safety, the API only accepts browser calls from the origins it allows — by default the `nt2gui client` default (`http://localhost:8766`).

Data read from disk is kept in memory so that changing colors, zooming, slicing or switching between quantities doesn't re-read it: up to 2 GB of field data and 2 GB of particle data per open simulation. Adjust with `NT2GUI_FIELD_CACHE_MB` / `NT2GUI_PARTICLE_CACHE_MB` (in MB) before starting the server. The server log reports any request that takes longer than half a second.

By default the server listens on `127.0.0.1` only. The UI session is saved to `.nt2gui/session.json` in the working directory (override with `--state-file` or `$NT2GUI_STATE_FILE`) and restored on restart.

## Development

```bash
pip install -r requirements.txt    # or: pip install -e ".[dev]"
npm i
npm run dev       # Flask on :5000 and vite with /api proxied to it
npm run test      # typecheck + vitest + pytest
npm run package   # build the client into nt2gui/static, then the wheel/sdist into dist/
```
