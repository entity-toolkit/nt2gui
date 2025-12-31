import numpy as np
import xarray as xr


from uuid import uuid4


class Simulation:
    def __init__(self, path: str) -> None:
        self.id = uuid4().hex
        self.path = path

        self._t = np.linspace(0, 1, 50)
        self._x = np.linspace(0, 10, 100)
        self._y = np.linspace(-5, 5, 128)

        xx, yy, tt = np.meshgrid(self.x, self.y, self.t, indexing="ij")
        f = np.sin(xx - 2 * np.pi * tt) * np.cos(yy)
        g = np.exp(-((xx - 5) ** 2 + (yy) ** 2)) * np.sin(4 * np.pi * tt)

        self._fields = xr.Dataset(
            data_vars={"f": (("x", "y", "t"), f), "g": (("x", "y", "t"), g)},
            coords={"t": self.t, "x": self.x, "y": self.y},
        )

    @property
    def fields(self) -> xr.Dataset:
        return self._fields

    def to_json(self) -> dict:
        return {"id": self.id, "path": self.path}

    @property
    def t(self) -> np.ndarray:
        return self._t

    @property
    def x(self) -> np.ndarray:
        return self._x

    @property
    def y(self) -> np.ndarray:
        return self._y
