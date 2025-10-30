"""Compatibility wrapper exposing the AlphaEvolve demo as a Python package."""
from __future__ import annotations

from importlib import import_module
from pathlib import Path
import sys

_pkg_dir = Path(__file__).resolve().parent.parent / "AlphaEvolve-v0"
if str(_pkg_dir) not in sys.path:
    sys.path.append(str(_pkg_dir))

alphaevolve_demo = import_module("alphaevolve_demo")

__all__ = ["alphaevolve_demo"]

