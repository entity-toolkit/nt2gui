"""Array helpers for JSON responses."""

import numpy as np


def finite_list(values: object) -> list[float | None]:
    """Floats for JSON, with NaN/inf (not valid JSON) as null."""
    array = np.asarray(values, dtype=float).ravel()
    return [float(v) if np.isfinite(v) else None for v in array]
