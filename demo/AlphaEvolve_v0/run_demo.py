"""ASCII-safe launcher for the AlphaEvolve demo.

This wrapper mirrors the canonical ``run_demo.py`` that lives under
``demo/AlphaEvolve-v0`` so operators can execute the experiment from the
proxy package as well. It keeps the code-paths in sync while preserving a
stable CLI regardless of the working directory.
"""
from __future__ import annotations

import importlib
import inspect
import sys
from pathlib import Path
from typing import Iterable, Optional, Protocol


class _MainFn(Protocol):
    def __call__(self, argv: list[str]) -> None: ...


# Paths used to locate the canonical implementation when executed directly.
REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_DEMO_DIR = REPO_ROOT / "demo" / "AlphaEvolve-v0"
CANONICAL_MODULE = "demo.AlphaEvolve-v0.run_demo"


def _bootstrap_sys_path() -> None:
    """Ensure the canonical demo directory is importable without installation."""

    for path in (REPO_ROOT, CANONICAL_DEMO_DIR):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)


def _resolve_main() -> _MainFn:
    module = importlib.import_module(CANONICAL_MODULE)
    try:
        return module.main
    except AttributeError as exc:  # pragma: no cover - defensive
        raise AttributeError(f"{CANONICAL_MODULE} does not expose a 'main' callable") from exc


def run(argv: Optional[Iterable[str]] = None, *, main_fn: _MainFn | None = None) -> None:
    """Execute the canonical AlphaEvolve demo from the proxy package."""

    if argv is None:
        argv = sys.argv[1:]

    _bootstrap_sys_path()
    launcher = main_fn or _resolve_main()

    params = inspect.signature(launcher).parameters
    if not params:
        launcher()
    else:
        launcher(list(argv))


if __name__ == "__main__":  # pragma: no cover - exercised via integration test
    run()
