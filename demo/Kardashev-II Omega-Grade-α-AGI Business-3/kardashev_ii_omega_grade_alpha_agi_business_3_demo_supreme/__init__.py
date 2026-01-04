"""Supreme Omega-grade Kardashev-II business orchestrator demo package."""

from __future__ import annotations

__all__ = [
    "SupremeDemoConfig",
    "SupremeOrchestrator",
    "build_arg_parser",
    "main",
    "run_from_cli",
]


def __getattr__(name: str):
    if name == "SupremeDemoConfig":
        from .config import SupremeDemoConfig

        return SupremeDemoConfig
    if name == "SupremeOrchestrator":
        from .orchestrator import SupremeOrchestrator

        return SupremeOrchestrator
    if name == "build_arg_parser":
        from .cli import build_arg_parser

        return build_arg_parser
    if name == "run_from_cli":
        from .cli import run_from_cli

        return run_from_cli
    if name == "main":
        from .cli import main

        return main
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return sorted(__all__)
