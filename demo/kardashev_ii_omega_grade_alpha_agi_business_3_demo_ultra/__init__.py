"""Compatibility wrapper for the Kardashev-II Omega-Grade Ultra demo."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_SOURCE_DIR = (
    _THIS_DIR
    / ".."
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra"
).resolve()

if str(_SOURCE_DIR) not in sys.path:
    sys.path.insert(0, str(_SOURCE_DIR.parent))

_spec = importlib.util.spec_from_file_location(
    __name__,
    _SOURCE_DIR / "__init__.py",
    submodule_search_locations=[str(_SOURCE_DIR)],
)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive
    raise ImportError("Unable to load ultra demo package")
_module = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _module
_spec.loader.exec_module(_module)

# Ensure helper modules that live alongside this wrapper stay importable. Without
# this, Python would only search the Unicode-heavy source directory for
# submodules, preventing convenience entrypoints from being discovered.
if hasattr(_module, "__path__"):
    package_path = str(_THIS_DIR)
    if package_path not in _module.__path__:
        _module.__path__.append(package_path)

from .cli import main  # type: ignore[attr-defined]  # noqa: E402
from . import run_demo  # noqa: E402,F401  (re-exported for convenience)

__all__ = getattr(_module, "__all__", [])
