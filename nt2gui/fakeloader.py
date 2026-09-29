"""Synthetic simulation for trying the app without data (paths `demo:...`)."""

from uuid import uuid4

import numpy as np
import pandas as pd
import xarray as xr


# nt2py reports species by index only; masses and labels come with the data.
SPECIES = [
    {"index": 1, "label": "e-", "mass": 1.0},
    {"index": 2, "label": "e+", "mass": 1.0},
    {"index": 3, "label": "photons", "mass": 0.0},
]
PARTICLES_PER_SPECIES = 20_000


def _random_directions(rng: np.random.Generator, n: int) -> np.ndarray:
    vectors = rng.normal(size=(3, n))
    return vectors / np.linalg.norm(vectors, axis=0)


class FakeSimulation:
    def __init__(self, path: str, simulation_id: str | None = None) -> None:
        # A persisted id is passed back in when re-opening a saved session so
        # plotters referencing this simulation stay valid across restarts.
        self.id = simulation_id or uuid4().hex
        self.path = path

        self._t = np.linspace(0, 1, 50)
        self._x = np.linspace(0, 10, 100)
        self._y = np.linspace(-5, 5, 128)

        xx, yy, tt = np.meshgrid(self.x, self.y, self.t, indexing="ij")
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
        x4, y4, z4, t4 = np.meshgrid(self.x, self.y, self._z, self.t, indexing="ij")
        data_vars["rho"] = (
            ("x", "y", "z", "t"),
            np.exp(-((x4 - 5 - 3 * np.sin(2 * np.pi * t4)) ** 2) / 4 - y4**2 / 4 - z4**2)
            .astype(np.float32),
        )

        self._fields = xr.Dataset(
            data_vars=data_vars,
            coords={"t": self.t, "x": self.x, "y": self.y, "z": self._z},
        )

    @property
    def fields(self) -> xr.Dataset:
        return self._fields

    @property
    def species(self) -> list[dict]:
        return SPECIES

    def particles(self, time: float) -> pd.DataFrame:
        """Particles at the output step nearest to `time`, laid out like
        nt2py's `ParticleDataset.load()`: one row per particle."""
        step = int(np.abs(self.t - time).argmin())
        cache = self.__dict__.setdefault("_particle_cache", {})
        if step not in cache:
            if len(cache) >= 8:
                cache.pop(next(iter(cache)))
            cache[step] = self._make_particles(step)
        return cache[step]

    def _make_particles(self, step: int) -> pd.DataFrame:
        rng = np.random.default_rng(step)
        t = float(self.t[step])
        n = PARTICLES_PER_SPECIES
        frames = []
        for species in SPECIES:
            x = rng.uniform(self.x.min(), self.x.max(), n)
            y = rng.uniform(self.y.min(), self.y.max(), n)
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
        return self.t

    def particle_time(self, time: float) -> float:
        return float(self.t[int(np.abs(self.t - time).argmin())])

    def to_json(self) -> dict:
        return {"id": self.id, "path": self.path}

    @property
    def timeline(self) -> dict:
        step = float(np.diff(self.t).min()) if len(self.t) > 1 else 1.0
        return {
            "current": float(self.t[0]),
            "min": float(self.t.min()),
            "max": float(self.t.max()),
            "step": step,
        }

    @property
    def t(self) -> np.ndarray:
        return self._t

    @property
    def x(self) -> np.ndarray:
        return self._x

    @property
    def y(self) -> np.ndarray:
        return self._y
