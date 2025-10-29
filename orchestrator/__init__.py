"""Lightweight orchestration helpers for the meta-orchestrator FastAPI router."""

from __future__ import annotations

from importlib import import_module
from types import ModuleType
from typing import Dict

_MODULES = [
    "config",
    "models",
    "planner",
    "policies",
    "runner",
    "simulator",
    "tools",
    "events",
    "state",
    "aa",
    "analytics",
    "workflows",
]
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


_CACHE: Dict[str, ModuleType | None] = {}


def __getattr__(name: str) -> ModuleType | None:
    if name not in _MODULES:
        raise AttributeError(name)
    if name not in _CACHE:
        _CACHE[name] = _load_optional(name)
    return _CACHE[name]


def __dir__() -> list[str]:
    return sorted(set(__all__ + list(globals().keys())))
