"""AGI Alpha Node demo package."""
from importlib import metadata

__all__ = ["__version__"]

try:
    __version__ = metadata.version("alpha-node")
except metadata.PackageNotFoundError:  # pragma: no cover - fallback when not installed
    __version__ = "0.0.0"
