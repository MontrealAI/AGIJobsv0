"""Proxy module exposing the canonical implementation stored under `AlphaEvolve-v0`."""
from __future__ import annotations

from importlib import import_module
from pathlib import Path
import sys

_pkg_dir = Path(__file__).resolve().parents[1] / "AlphaEvolve-v0"
if str(_pkg_dir) not in sys.path:
    sys.path.append(str(_pkg_dir))

_alpha_pkg = import_module("alphaevolve_demo")

for name in getattr(_alpha_pkg, "__all__", []):
    module = getattr(_alpha_pkg, name)
    globals()[name] = module
    sys.modules.setdefault(f"{__name__}.{name}", module)

__all__ = getattr(_alpha_pkg, "__all__", [])

