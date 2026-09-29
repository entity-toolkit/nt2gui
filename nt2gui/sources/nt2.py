"""Entity simulation output read through nt2py (https://github.com/entity-toolkit/nt2py).

`nt2.Data(path)` gives lazily loaded (dask-backed) fields as an xarray Dataset
with dims (t, *spatial), and particles as a `ParticleDataset` whose
`.isel(t=i).load()` is a pandas DataFrame with one row per particle. nt2py
knows species only by index, so labels and masses are read from the
`<name>.info` file Entity writes next to its output.
"""

import logging
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
import xarray as xr

from ..data.quantities import TIME_DIM
from ..errors import UserError
from . import combined_timeline, nearest_index
from .cache import StepCache

logger = logging.getLogger(__name__)

# Keep a couple of particle steps in memory; one step can be millions of rows.
PARTICLE_CACHE_SIZE = 2
# Bookkeeping columns nt2py adds that aren't particle quantities.
PARTICLE_INDEX_COLUMNS = ("t", "st", "row")

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
        self._data = nt2.Data(str(root))
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
        self._particle_cache: StepCache[pd.DataFrame] = StepCache(PARTICLE_CACHE_SIZE)

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

    def particles(self, time: float) -> pd.DataFrame:
        step = nearest_index(self._require_particles().times, time)
        return self._particle_cache.get(step, lambda: self._load_particles(step))

    def _load_particles(self, step: int) -> pd.DataFrame:
        frame = self._require_particles().isel(t=step).load()
        return frame.drop(
            columns=[c for c in PARTICLE_INDEX_COLUMNS if c in frame.columns]
        )
