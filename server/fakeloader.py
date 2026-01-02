import numpy as np
import xarray as xr
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import base64
from io import BytesIO


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

    def render_pseudocolor(self, config: dict, time_value: float) -> dict:
        field = config.get("field")
        x_coordinate = config.get("xCoordinate", "x")
        y_coordinate = config.get("yCoordinate", "y")

        if not field:
            raise ValueError("Field name is required for pseudocolor rendering")

        if field not in self._fields:
            raise KeyError(f"Field '{field}' not found in simulation")

        data_array = self._fields[field]

        if "t" not in data_array.coords:
            raise ValueError("Field does not contain time coordinate")

        slice_data = data_array.sel(t=time_value, method="nearest")
        actual_time = float(slice_data.coords["t"].item())

        ordered = slice_data.transpose(x_coordinate, y_coordinate)
        values = ordered.values

        x_vals = self._fields.coords.get(x_coordinate, self.x)
        y_vals = self._fields.coords.get(y_coordinate, self.y)

        fig, ax = plt.subplots(figsize=(5, 4), dpi=120)
        extent = (
            float(x_vals.min()),
            float(x_vals.max()),
            float(y_vals.min()),
            float(y_vals.max()),
        )
        im = ax.imshow(
            values,
            origin="lower",
            cmap=config.get("colorMap") or "viridis",
            vmin=config.get("vmin"),
            vmax=config.get("vmax"),
            extent=extent,
            aspect="auto",
        )

        colorbar = fig.colorbar(im, ax=ax, label=field)
        fig.canvas.draw()

        x_ticks = [float(tick) for tick in ax.get_xticks()]
        y_ticks = [float(tick) for tick in ax.get_yticks()]

        x_ticklabels = [label.get_text() for label in ax.get_xticklabels()]
        y_ticklabels = [label.get_text() for label in ax.get_yticklabels()]

        colorbar_ticks = [float(tick) for tick in colorbar.get_ticks()]
        colorbar_ticklabels = [
            label.get_text() for label in colorbar.ax.get_yticklabels()
        ]
        vmin, vmax = im.get_clim()

        colorbar.remove()
        ax.set_axis_off()
        ax.set_position([0, 0, 1, 1])

        fig.canvas.draw()
        image_width, image_height = fig.canvas.get_width_height()

        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches=None, pad_inches=0)
        plt.close(fig)
        buffer.seek(0)
        encoded = base64.b64encode(buffer.read()).decode("ascii")

        return {
            "image": encoded,
            "timestamp": actual_time,
            "extent": {
                "xMin": extent[0],
                "xMax": extent[1],
                "yMin": extent[2],
                "yMax": extent[3],
            },
            "imageSize": {"width": image_width, "height": image_height},
            "xTicks": {"positions": x_ticks, "labels": x_ticklabels},
            "yTicks": {"positions": y_ticks, "labels": y_ticklabels},
            "colorbar": {
                "ticks": colorbar_ticks,
                "labels": colorbar_ticklabels,
                "vmin": float(vmin),
                "vmax": float(vmax),
            },
            "colorMap": im.get_cmap().name,
        }
