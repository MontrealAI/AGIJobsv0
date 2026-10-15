"""Compatibility launcher for the Astral Omnidominion Operating System demo.

This shim preserves the underscore-style package name while delegating to the
canonical hyphenated demo located at
``demo/astral-omnidominion-operating-system/run_demo.py``. By reusing the
primary entrypoint, we avoid diverging behaviours and keep a single source of
truth for command construction and ergonomics.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Iterable, Protocol

PRIMARY_DEMO_PATH = (
    Path(__file__).resolve().parent.parent
    / "astral-omnidominion-operating-system"
    / "run_demo.py"
)


class _Runner(Protocol):
    def __call__(self, cmd: list[str], *, check: bool, cwd: str | Path):
        ...


class _InteractiveProbe(Protocol):
    def __call__(self) -> bool: ...


def _load_primary_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "astral_omnidominion_operating_system_primary", PRIMARY_DEMO_PATH
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load primary demo from {PRIMARY_DEMO_PATH}")

    module = importlib.util.module_from_spec(spec)
    # Execute source directly so compatibility plan/help never writes a
    # canonical-module bytecode cache before argument validation.
    code = compile(PRIMARY_DEMO_PATH.read_bytes(), str(PRIMARY_DEMO_PATH), "exec")
    exec(code, module.__dict__)
    return module


def build_command(args: Iterable[str]) -> list[str]:
    """Use the canonical validation and exact npm argument construction."""

    return _load_primary_module().build_command(args)


def run(
    argv: Iterable[str] | None = None,
    *,
    runner: _Runner | None = None,
    is_interactive: _InteractiveProbe | None = None,
) -> int:
    primary = _load_primary_module()
    return primary.run(argv=argv, runner=runner, is_interactive=is_interactive)


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
