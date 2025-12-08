"""Local shim that proxies to the repository-level :mod:`eth_typing` patch."""
from __future__ import annotations

import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SHIM_PATH = REPO_ROOT / "eth_typing.py"
if not SHIM_PATH.exists():
    raise ImportError(f"Shared eth_typing shim missing at {SHIM_PATH}")

_spec = importlib.util.spec_from_file_location("agi_jobs_eth_typing", SHIM_PATH)
if _spec is None or _spec.loader is None:
    raise ImportError("Unable to load shared eth_typing shim")

_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

for _name in dir(_module):
    if _name.startswith("__"):
        continue
    globals()[_name] = getattr(_module, _name)

__all__ = [name for name in globals() if not name.startswith("_")]
__file__ = str(SHIM_PATH)

# Keep a reference around for debugging.
BACKEND_MODULE = _module
