"""Compatibility wrapper for the Omega-grade demo package.

This module bridges the top-level ``demo/kardashev_ii_...`` namespace to the
canonical package that lives under the ``Kardashev-II Omega-Grade-α-AGI
Business-3`` directory (with spaces and Unicode characters in the path). The
loader below eagerly imports the real package and re-exports its public API so
that ``import demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo`` works as
expected for downstream tooling.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


_THIS_DIR = Path(__file__).resolve().parent
_SOURCE_DIR = _THIS_DIR / ".." / "Kardashev-II Omega-Grade-α-AGI Business-3" / "kardashev_ii_omega_grade_alpha_agi_business_3_demo"
_SOURCE_DIR = _SOURCE_DIR.resolve()

if str(_SOURCE_DIR) not in sys.path:
    sys.path.insert(0, str(_SOURCE_DIR.parent))

_spec = importlib.util.spec_from_file_location(
    __name__, _SOURCE_DIR / "__init__.py", submodule_search_locations=[str(_SOURCE_DIR)]
)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive
    raise ImportError("Unable to load Omega-grade demo package")
_module = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _module
_spec.loader.exec_module(_module)

__all__ = getattr(_module, "__all__", [])
main = getattr(_module, "main")


def __getattr__(name: str) -> Any:
    """Delegate attribute access to the underlying module.

    This keeps the wrapper lightweight while ensuring all public symbols remain
    available to callers even if new exports are added to the upstream package.
    """

    return getattr(_module, name)


def __dir__() -> list[str]:  # pragma: no cover - intellisense helper
    return sorted(set(__all__) | set(dir(ModuleType)))
