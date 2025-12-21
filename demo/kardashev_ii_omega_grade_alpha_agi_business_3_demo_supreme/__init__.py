"""Compatibility wrapper for the Supreme Omega-grade demo package."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_SOURCE_DIR = (
    _THIS_DIR
    / ".."
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme"
).resolve()

if str(_SOURCE_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_SOURCE_DIR.parent))

_spec = importlib.util.spec_from_file_location(
    __name__,
    _SOURCE_DIR / "__init__.py",
    submodule_search_locations=[str(_SOURCE_DIR)],
)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive guard
    raise ImportError("Unable to load Supreme Omega-grade demo package")
_module = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _module
_spec.loader.exec_module(_module)

# Ensure the compatibility wrapper exposes a stable ``main`` callable for
# consumers such as ``run_demo.py``. The upstream package intentionally keeps
# its public surface minimal; wiring ``main`` to ``run_from_cli`` here provides
# an ergonomic, ASCII-safe entrypoint without mutating the source package.
_main = getattr(_module, "run_from_cli", None)
if _main is not None and not hasattr(_module, "main"):
    setattr(_module, "main", _main)
    if hasattr(_module, "__all__"):
        upstream_all = list(getattr(_module, "__all__", ()))
        if "main" not in upstream_all:
            setattr(_module, "__all__", upstream_all + ["main"])

# Keep local helper modules (such as ``run_demo.py``) importable alongside the
# canonical package contents.
if hasattr(_module, "__path__"):
    package_path = str(_THIS_DIR)
    if package_path not in _module.__path__:
        _module.__path__.append(package_path)

__all__ = getattr(_module, "__all__", [])
run_from_cli = getattr(_module, "run_from_cli", None)
build_arg_parser = getattr(_module, "build_arg_parser", None)
main = getattr(_module, "main", getattr(_module, "run_from_cli", None))
