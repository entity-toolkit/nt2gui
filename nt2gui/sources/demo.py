"""Synthetic simulation for trying the app without data (paths `demo:...`)."""

from collections.abc import Sequence
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
import xarray as xr

from . import DEMO_PREFIX, combined_timeline, nearest_index
from .cache import StepCache

# nt2py reports species by index only; masses and labels come with the data.
SPECIES = [
    {"index": 1, "label": "e-", "mass": 1.0},
    {"index": 2, "label": "e+", "mass": 1.0},
    {"index": 3, "label": "photons", "mass": 0.0},
]
PARTICLES_PER_SPECIES = 20_000
PARTICLE_CACHE_SIZE = 8
PARTICLE_COLUMNS = ("x", "y", "ux", "uy", "uz", "w")


def _random_directions(rng: np.random.Generator, n: int) -> np.ndarray:
    vectors = rng.normal(size=(3, n))
    return vectors / np.linalg.norm(vectors, axis=0)


class DemoSimulation:
    def __init__(self, path: str, simulation_id: str | None = None) -> None:
        # A persisted id is passed back in when re-opening a saved session so
        # plotters referencing this simulation stay valid across restarts.
        self.id = simulation_id or uuid4().hex
        self.path = path
        self.name = path.removeprefix(DEMO_PREFIX) or "demo"

        self._t = np.linspace(0, 1, 50)
        self._x = np.linspace(0, 10, 100)
        self._y = np.linspace(-5, 5, 128)

        xx, yy, tt = np.meshgrid(self._x, self._y, self._t, indexing="ij")
        f = np.sin(xx - 2 * np.pi * tt) * np.cos(yy)
        g = np.exp(-((xx - 5) ** 2 + (yy) ** 2)) * np.sin(4 * np.pi * tt)

        phase = xx - 2 * np.pi * tt
        dims = ("x", "y", "t")
        data_vars = {
            "f": (dims, f),
            "g": (dims, g),
            # Vector components, so line plots can show "B"/"E" as groups.
            "Bx": (dims, 0.2 * np.cos(yy) + 0 * xx),
            "By": (dims, np.sin(phase) * np.exp(-(yy**2) / 8)),
            "Bz": (dims, np.cos(phase) * np.exp(-(yy**2) / 8)),
            "Ex": (dims, 0.1 * np.sin(2 * phase)),
            "Ey": (dims, -np.cos(phase) * np.exp(-(yy**2) / 8)),
            "Ez": (dims, np.sin(phase) * np.exp(-(yy**2) / 8)),
            "N_1": (dims, 1 + 0.5 * np.exp(-((xx - 3 - 4 * tt) ** 2) - yy**2 / 4)),
            "N_2": (dims, 1 + 0.3 * np.cos(yy) * np.sin(xx + 2 * np.pi * tt) ** 2),
        }

        # A 3D field, so plots can be sliced along a third axis. float32 and
        # a short z keep the fake dataset small.
        self._z = np.linspace(-2, 2, 9)
        x4, y4, z4, t4 = np.meshgrid(self._x, self._y, self._z, self._t, indexing="ij")
        data_vars["rho"] = (
            ("x", "y", "z", "t"),
            np.exp(
                -((x4 - 5 - 3 * np.sin(2 * np.pi * t4)) ** 2) / 4 - y4**2 / 4 - z4**2
            ).astype(np.float32),
        )

        self._particle_cache: StepCache[pd.DataFrame] = StepCache(max_items=PARTICLE_CACHE_SIZE)
        self._fields = xr.Dataset(
            data_vars=data_vars,
            coords={"t": self._t, "x": self._x, "y": self._y, "z": self._z},
        )

    @property
    def fields(self) -> xr.Dataset:
        return self._fields

    @property
    def species(self) -> list[dict[str, Any]]:
        return [dict(species) for species in SPECIES]

    @property
    def particle_columns(self) -> list[str]:
        return list(PARTICLE_COLUMNS)

    def particles(
        self, time: float, columns: Sequence[str] | None = None
    ) -> pd.DataFrame:
        """Particles at the output step nearest to `time`, laid out like
        nt2py's `ParticleDataset.load()`: one row per particle."""
        step = nearest_index(self._t, time)
        frame = self._particle_cache.get(step, lambda: self._make_particles(step))
        wanted = PARTICLE_COLUMNS if columns is None else columns
        return frame[["sp", *[c for c in wanted if c != "sp"]]]

    def species_counts(self, time: float) -> dict[int, int]:
        counts = self.particles(time, columns=[])["sp"].value_counts()
        return {s["index"]: int(counts.get(s["index"], 0)) for s in SPECIES}

    def _make_particles(self, step: int) -> pd.DataFrame:
        rng = np.random.default_rng(step)
        t = float(self._t[step])
        n = PARTICLES_PER_SPECIES
        frames = []
        for species in SPECIES:
            x = rng.uniform(self._x.min(), self._x.max(), n)
            y = rng.uniform(self._y.min(), self._y.max(), n)
            if species["index"] == 1:
                # Thermal electrons carried by a wave: structure in x-ux.
                u = rng.normal(0, 0.4, size=(3, n))
                u[0] += 1.5 * np.sin(x - 2 * np.pi * t)
            elif species["index"] == 2:
                # Hotter positrons with a growing power-law tail.
                u = rng.normal(0, 1.0, size=(3, n))
                tail = rng.random(n) < 0.1 + 0.2 * t
                magnitude = (1 - rng.random(tail.sum())) ** (-1 / 1.5)
                u[:, tail] = magnitude * _random_directions(rng, int(tail.sum()))
            else:
                # Photons: log-uniform energies, beamed along +x over time.
                energy = 10 ** rng.uniform(-2, 2 + t, n)
                direction = _random_directions(rng, n)
                direction[0] = np.abs(direction[0]) * (0.5 + t) + direction[0]
                direction /= np.linalg.norm(direction, axis=0)
                u = energy * direction
            frames.append(
                pd.DataFrame(
                    {
                        "id": np.arange(n, dtype=np.int64),
                        "sp": np.full(n, species["index"], dtype=np.int32),
                        "x": x.astype(np.float32),
                        "y": y.astype(np.float32),
                        "ux": u[0].astype(np.float32),
                        "uy": u[1].astype(np.float32),
                        "uz": u[2].astype(np.float32),
                        "w": rng.uniform(0.5, 1.5, n).astype(np.float32),
                    }
                )
            )
        return pd.concat(frames, ignore_index=True)

    @property
    def spectra(self) -> xr.Dataset | None:
        return None

    @property
    def particle_times(self) -> np.ndarray:
        return self._t

    def particle_time(self, time: float) -> float:
        return float(self._t[nearest_index(self._t, time)])

    @property
    def timeline(self) -> dict[str, float]:
        return combined_timeline(self._t)

    @property
    def attrs(self) -> dict[str, Any]:
        # Shaped like Entity's (see nt2.Data.attrs): flat, dotted, numpy-typed.
        return {
            "Coordinates": np.bytes_(b"cart"),
            "Dimension": np.uint64(3),
            "simulation.name": np.bytes_(self.name.encode()),
            "simulation.engine": np.bytes_(b"demo"),
            "grid.resolution": np.array(
                [self._x.size, self._y.size, self._z.size], dtype=np.uint64
            ),
            "grid.extent": np.array(
                [self._x[0], self._x[-1], self._y[0], self._y[-1], self._z[0], self._z[-1]],
                dtype=np.float32,
            ),
            "grid.metric.metric": np.bytes_(b"minkowski"),
            "grid.boundaries.fields": np.array([b"periodic", b"periodic"], dtype="S8"),
            "algorithms.timestep.CFL": np.float32(0.5),
            "algorithms.timestep.dt": np.float32(self._t[1] - self._t[0]),
            "algorithms.deposit.enable": np.int32(1),
            "output.fields.quantities": np.array([b"E  ", b"B  ", b"N_1"], dtype="S3"),
            "output.interval": np.uint64(1),
        }
