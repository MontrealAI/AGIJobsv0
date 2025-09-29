"""Lightweight orchestration helpers for the meta-orchestrator FastAPI router."""

from __future__ import annotations

from importlib import import_module
from types import ModuleType
from typing import Dict

_MODULES = ["config", "models", "planner", "policies", "runner", "simulator", "tools", "events", "state"]
__all__ = list(_MODULES)


def _load_optional(name: str) -> ModuleType | None:
    try:
        return import_module(f".{name}", __name__)
    except ModuleNotFoundError as exc:
        # FastAPI and other heavy dependencies are optional during unit tests.  When
        # unavailable, expose a ``None`` sentinel so ``pytest.importorskip`` can take
        # over without breaking the package import.
        missing = exc.name or ""
        if missing.startswith("fastapi") or missing.startswith("redis"):
            return None
        raise


def _expose_modules() -> Dict[str, ModuleType | None]:
    exported: Dict[str, ModuleType | None] = {}
    for name in _MODULES:
        exported[name] = _load_optional(name)
    return exported


globals().update(_expose_modules())
