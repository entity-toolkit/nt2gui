"""Entity simulation output read through nt2py (https://github.com/entity-toolkit/nt2py).

`nt2.Data(path)` gives lazily loaded (dask-backed) fields as an xarray Dataset
with dims (t, *spatial), and particles as a `ParticleDataset` whose
`.isel(t=i).load()` is a pandas DataFrame with one row per particle. nt2py
knows species only by index, so labels and masses are read from the
`<name>.info` file Entity writes next to its output.
"""

import logging
import re
import threading
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
import xarray as xr

from .. import config
from ..data.quantities import TIME_DIM
from ..errors import UserError
from . import combined_timeline, nearest_index
from .cache import StepCache

logger = logging.getLogger(__name__)

# Bookkeeping columns nt2py adds that aren't particle quantities.
PARTICLE_INDEX_COLUMNS = ("t", "st", "row", "id")
SPECIES_COLUMN = "sp"


class FieldCachingReader:
    """Wraps an nt2py reader so each (field, step) array is read from disk once.

    nt2py's fields are lazy dask arrays with one chunk per step, and every
    `.values` re-runs the read of the whole step. Caching at the reader keeps
    the dask graphs intact while making repeated renders of a step (colormap
    changes, slices, zooms, expressions) read from memory. Other categories
    (particles) pass through.
    """

    def __init__(self, reader: Any, cache: StepCache[Any]) -> None:
        self._reader = reader
        self._cache = cache

    def __getattr__(self, name: str) -> Any:
        return getattr(self._reader, name)

    def ReadArrayAtTimestep(self, path: str, category: str, quantity: str, step: int):
        if category != "fields":
            return self._reader.ReadArrayAtTimestep(path, category, quantity, step)
        return self._cache.get(
            (quantity, step),
            lambda: self._reader.ReadArrayAtTimestep(path, category, quantity, step),
        )


def _caching_reader(root: Path, cache: StepCache[Any]) -> FieldCachingReader:
    from nt2.readers.adios2 import Reader as BP5Reader
    from nt2.readers.hdf5 import Reader as HDF5Reader
    from nt2.utils import DetermineDataFormat, Format

    fmt = DetermineDataFormat(str(root))
    if fmt == Format.HDF5:
        return FieldCachingReader(HDF5Reader(), cache)
    if fmt == Format.BP5:
        return FieldCachingReader(BP5Reader(), cache)
    raise ValueError(f"Unsupported data format in {root}: {fmt}")


_SPECIES_HEADER = re.compile(r"^(\s*)-\s*Species #(\d+):\s*$")
_SPECIES_PROPERTY = re.compile(r"^\s*-\s*(Label|Mass|Charge):\s*(.+?)\s*$")


def parse_species_info(text: str) -> dict[int, dict[str, Any]]:
    """Species label/mass/charge from an Entity `.info` file, by index.

    The file lists, under "Particles", blocks like::

        - Species #2:
          - Label: ph
          - Mass: 0.0
          - Charge: 0.0
    """
    species: dict[int, dict[str, Any]] = {}
    current: int | None = None
    header_indent = 0
    for line in text.splitlines():
        header = _SPECIES_HEADER.match(line)
        if header:
            header_indent = len(header.group(1))
            current = int(header.group(2))
            species[current] = {}
            continue
        if current is None or not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if indent <= header_indent:
            # Back out of the species block.
            current = None
            continue
        prop = _SPECIES_PROPERTY.match(line)
        if not prop:
            continue
        key, value = prop.group(1).lower(), prop.group(2)
        if key == "label":
            species[current]["label"] = value
        else:
            try:
                species[current][key] = float(value)
            except ValueError:
                pass
    return species


def run_name(root: Path) -> str:
    """The simulation's name: Entity writes `<name>.info` next to its output;
    without one, the directory's name."""
    info = next(iter(sorted(root.glob("*.info"))), None)
    return info.stem if info else root.resolve().name


def _read_species_info(root: Path) -> dict[int, dict[str, Any]]:
    for info in sorted(root.glob("*.info")):
        try:
            return parse_species_info(info.read_text(errors="replace"))
        except OSError as error:
            logger.warning("Could not read %s: %s", info, error)
    return {}


class Nt2Simulation:
    def __init__(self, path: str, simulation_id: str | None = None) -> None:
        root = Path(path).expanduser()
        if not root.is_dir():
            raise FileNotFoundError(f"No such directory: {path}")

        import nt2  # imported lazily: it pulls in dask, adios2, ...

        self.id = simulation_id or uuid4().hex
        self.path = path
        self.name = run_name(root)
        self._field_cache: StepCache[Any] = StepCache(
            max_bytes=config.cache_bytes(
                config.FIELD_CACHE_ENV, config.DEFAULT_FIELD_CACHE_MB
            )
        )
        self._data = nt2.Data(str(root), reader=_caching_reader(root, self._field_cache))
        if not (self._data.fields_defined or self._data.particles_defined):
            raise ValueError(f"No field or particle output found in {path}")

        self._fields = self._data.fields if self._data.fields_defined else xr.Dataset()
        self._particles = self._data.particles if self._data.particles_defined else None
        info = _read_species_info(root)
        self._species = [
            {
                "index": int(index),
                "label": info.get(int(index), {}).get("label", f"species {index}"),
                # None when the .info file is missing: mass unknown.
                "mass": info.get(int(index), {}).get("mass"),
            }
            for index in (self._particles.species if self._particles else [])
        ]
        # (step, column) -> values; particle columns are cached one by one, so
        # plots read only what they show.
        self._particle_cache: StepCache[np.ndarray] = StepCache(
            max_bytes=config.cache_bytes(
                config.PARTICLE_CACHE_ENV, config.DEFAULT_PARTICLE_CACHE_MB
            )
        )
        # nt2py reads a step's missing columns in one go; one load at a time.
        self._particle_load_lock = threading.Lock()

    @property
    def fields(self) -> xr.Dataset:
        return self._fields

    @property
    def spectra(self) -> xr.Dataset | None:
        return self._data.spectra if self._data.spectra_defined else None

    @property
    def particle_times(self) -> np.ndarray:
        if self._particles is None:
            return np.empty(0)
        return np.asarray(self._particles.times, dtype=float)

    @property
    def species(self) -> list[dict[str, Any]]:
        return [dict(species) for species in self._species]

    @property
    def timeline(self) -> dict[str, float]:
        arrays = []
        if TIME_DIM in self._fields.coords:
            arrays.append(self._fields.coords[TIME_DIM].values)
        if self._particles is not None:
            arrays.append(self._particles.times)
        return combined_timeline(*arrays)

    def _require_particles(self) -> Any:
        if self._particles is None:
            raise UserError("This simulation has no particle output")
        return self._particles

    def particle_time(self, time: float) -> float:
        times = self._require_particles().times
        return float(times[nearest_index(times, time)])

    @property
    def particle_columns(self) -> list[str]:
        if self._particles is None:
            return []
        hidden = {SPECIES_COLUMN, *PARTICLE_INDEX_COLUMNS}
        return [c for c in self._particles.columns if c not in hidden]

    def particles(
        self, time: float, columns: Sequence[str] | None = None
    ) -> pd.DataFrame:
        step = nearest_index(self._require_particles().times, time)
        wanted = [SPECIES_COLUMN] + [
            c for c in (self.particle_columns if columns is None else columns)
            if c != SPECIES_COLUMN
        ]
        unknown = set(wanted) - {SPECIES_COLUMN, *self.particle_columns}
        if unknown:
            raise UserError(f"Unknown particle quantities: {', '.join(sorted(unknown))}")

        with self._particle_load_lock:
            values = {c: self._particle_cache.peek((step, c)) for c in wanted}
            missing = [c for c, v in values.items() if v is None]
            if missing:
                # The species index always comes along (nt2py's index column).
                frame = (
                    self._require_particles()
                    .isel(t=step)
                    .load(cols=[c for c in missing if c != SPECIES_COLUMN])
                )
                for column in missing:
                    array = frame[column].to_numpy()
                    self._particle_cache.put((step, column), array)
                    values[column] = array
        return pd.DataFrame(values)

    def species_counts(self, time: float) -> dict[int, int]:
        species = self.particles(time, columns=[])[SPECIES_COLUMN].to_numpy()
        indices, counts = np.unique(species, return_counts=True)
        counts_by_species = {int(i): int(c) for i, c in zip(indices, counts)}
        return {s["index"]: counts_by_species.get(s["index"], 0) for s in self._species}
