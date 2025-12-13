"""Launch the Meta-Agentic Program Synthesis demo from any working directory.

This wrapper mirrors the other demo entrypoints by forwarding arguments into
``start_demo.main`` after ensuring the repository and demo roots sit on
``sys.path``. It keeps the UX symmetric—``python demo/Meta-Agentic-Program-
Synthesis-v0/run_demo.py`` just works—while still allowing tests to inject a
custom main callable for fast verification.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Iterable, Optional

DEMO_ROOT = Path(__file__).resolve().parent
REPO_ROOT = DEMO_ROOT.parent


def _resolve_main():
    module = importlib.import_module("start_demo")
    try:
        return module.main
    except AttributeError as exc:  # pragma: no cover - defensive
        raise AttributeError("start_demo does not expose a 'main' callable") from exc


def _ensure_sys_path() -> None:
    for path in reversed((REPO_ROOT, DEMO_ROOT)):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)


def run(argv: Optional[Iterable[str]] = None, *, main_fn=None) -> None:
    """Execute the demo with optional argument forwarding."""

    _ensure_sys_path()
    main_callable = main_fn or _resolve_main()
    forwarded = list(argv) if argv is not None else sys.argv[1:]

    original_argv = sys.argv
    sys.argv = [original_argv[0]] + forwarded
    try:
        main_callable()
    finally:
        sys.argv = original_argv


if __name__ == "__main__":
    run()
