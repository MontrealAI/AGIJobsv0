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

__all__ = getattr(_module, "__all__", [])
run_from_cli = getattr(_module, "run_from_cli", None)
build_arg_parser = getattr(_module, "build_arg_parser", None)
