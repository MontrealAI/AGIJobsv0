"""Forwarder package for the Omega-grade alpha AGI business demo."""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


_pkg_dir = Path(__file__).resolve().parent
_nested = _pkg_dir.parent / "Kardashev-II Omega-Grade-α-AGI Business-3" / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega"
_nested = _nested.resolve()

if str(_nested) not in sys.path:
    sys.path.insert(0, str(_nested.parent))

_spec = importlib.util.spec_from_file_location(
    __name__, _nested / "__init__.py", submodule_search_locations=[str(_nested)]
)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive
    raise ImportError("Unable to load Omega-grade operator demo package")
_module = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _module
_spec.loader.exec_module(_module)

# Ensure ASCII-safe helpers such as run_demo remain importable alongside the
# canonical package contents. Without this, only the Unicode-heavy source
# directory would be searched for submodules.
if hasattr(_module, "__path__"):
    package_path = str(_pkg_dir)
    if package_path not in _module.__path__:
        _module.__path__.append(package_path)

__all__ = getattr(_module, "__all__", [])
_main_attr = getattr(_module, "main", None)
if _main_attr is None:
    _main_attr = importlib.import_module(f"{__name__}.cli").main
main = _main_attr


def __getattr__(name: str) -> Any:
    """Delegate attribute access to the underlying package."""

    return getattr(_module, name)


def __dir__() -> list[str]:  # pragma: no cover - intellisense helper
    return sorted(set(__all__) | set(dir(ModuleType)))
