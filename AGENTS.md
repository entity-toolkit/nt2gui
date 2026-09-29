# Description
- This is a scientific visualization app which has two components: a backend server, and a frontend UI 
- The backend is written in Python with Flask and handles the data analysis and post-processing, and UI persistency.
- Ultimately, the backend will be paired with the `nt2py` package to provide a UI for visualization (https://github.com/entity-toolkit/nt2py)
- The frontend is a react-based vite app written in typescript which uses flex-layout for to display multiple panels with selectable plots.
- The UI state should be synchronized with the server which must keep track of it and potentially recover at initialization.
  - The server owns the session (`server/session_store.py`): it always has a valid state (defaults from `server/schema.py`), persists it to `$NT2GUI_STATE_FILE` (default `.nt2gui/session.json`) with atomic writes, and re-opens saved simulations on restart.
  - `GET /state` returns `{revision, state, simulations}`; `PUT /state` takes `{revision, state}` and returns 409 with the current snapshot when the revision is stale. Simulation commands return the same snapshot.
  - Saved sessions (`server/session_files.py`) are the session without its revision: `{schemaVersion, state, simulations}`. `POST /session/save|load {path}` writes/reads files on the server machine (409 on overwrite unless `overwrite: true`); `GET /session/export` and `POST /session/import {session}` back the client-side download/upload. Loading replaces the whole session, re-opens its simulations (reporting failures in `warnings`), and bumps the revision.
  - The client never initializes the state: it renders only after `GET /state`, and all writes go through `client/src/sync/StateSync.ts` (debounced, serialized, retried; server wins on conflict).
  - When changing the state shape, update `client/src/global.ts` and `server/schema.py` together (bump `SCHEMA_VERSION` and add a migration for breaking changes).
- Plots are shaded on the server side, but the axes as well as the colorbars (if applicable) are reconstructed on the client-side using d3 elements.

# Data format on the backend
- The data will consist of two different types: fields (multi-D arrays with 1D/2D or 3D coordinates at different timesteps represented with an xarray dataset), and particles (pandas dataframe containing particle species index, coordinates, ids, velocities, and corresponding timesteps etc.).
- Particle plots (`server/particles.py`) are weighted histograms of one time step: 1D (`particleHistogramConfig`, several lines of different species sharing one binned x axis) and 2D phase space (`particlePhaseConfig`, shaded on the server). Quantities are the columns (`x`, `y`, `z`, `ux`, `uy`, `uz`, `w`), `gamma = sqrt(1 + u²)`, `energy = |u|` (massless species), or expressions. Axes bin uniformly in linear, log10, or `sign(A)|A|^p` space; the client uses the matching d3 scale (`scaleLog`, sign-preserving `scalePow`) so ticks show data values. An empty species list means all species.
- Fields have names and the user should be able to combine them (and, potentially, the coordinates) to create new variables.
  - Custom quantities are expression strings (e.g. `sqrt(Ex**2 + Ey**2)`) evaluated by `server/expressions.py`, an AST whitelist over fields, coordinates and numpy functions — never `eval`. Anywhere a field name is accepted (1D `quantities`, 2D `field`), an expression is too; each plot keeps its list in `expressions`, and `POST /simulations/<id>/quantities/check` validates one and returns its dims.

# Guidelines
- Use both react typescript and Python best-practices.
- Run `pip install -r requirements` to install python requirements and use `npm i` to install node requirements.
- use `npm run dev` to run both the server and the client concurrently.
- The state of UI must be fully reproducible and synchronized with the server.
- Run tests with `npm run test` (vitest + pytest), in the most error-prone routines -- always add unit tests.
