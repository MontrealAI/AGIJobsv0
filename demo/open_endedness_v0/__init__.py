"""Import-friendly facade for the Open-Endedness demo package."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_IMPL_INIT = _THIS_DIR.parent / "Open-Endedness-v0" / "__init__.py"
_SPEC = importlib.util.spec_from_file_location("demo.open_endedness_v0._impl", _IMPL_INIT)
if _SPEC is None or _SPEC.loader is None:  # pragma: no cover - defensive
    raise ImportError("Unable to load Open-Endedness demo implementation")
_MODULE = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault(_SPEC.name, _MODULE)
_SPEC.loader.exec_module(_MODULE)

__all__ = list(getattr(_MODULE, "__all__", ()))
for _name in __all__:
    globals()[_name] = getattr(_MODULE, _name)

# Re-export the implementation module for advanced consumers who may want to
# access package data (prompts, configs) relative to ``__file__``.
globals()["implementation_module"] = _MODULE
__all__.append("implementation_module")
