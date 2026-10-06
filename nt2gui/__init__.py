"""nt2gui: a browser UI for Entity (nt2py) simulation output."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("nt2gui")
except PackageNotFoundError:  # running from a source checkout
    __version__ = "0.0.0+unknown"
