"""Compatibility shim for pytest plugins expecting legacy eth_typing symbols."""
from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve()
ROOT_SHIM = None
for ancestor in ROOT.parents:
    candidate = ancestor / "eth_typing.py"
    if candidate == ROOT:
        continue
    if candidate.exists():
        ROOT_SHIM = candidate
        break

if ROOT_SHIM is None:  # pragma: no cover
    raise ImportError("Unable to locate repository-level eth_typing shim")

module_globals = runpy.run_path(str(ROOT_SHIM))
for name in ("__file__", "__path__", "__spec__", "__package__", "__loader__", "__doc__"):
    if name in module_globals:
        globals()[name] = module_globals[name]
for name, value in module_globals.items():
    if name.startswith("__"):
        continue
    globals()[name] = value

__all__ = [name for name in globals() if not name.startswith("__")]
