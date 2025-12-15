"""Executable entrypoint for the ultra-grade business demo wrapper.

This mirrors the ASCII-safe shim used by other Omega-grade demos. It ensures
operators can launch the canonical CLI that lives under
``demo/Kardashev-II Omega-Grade-α-AGI Business-3`` even when invoking the
wrapper file directly (for example
``python demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra/run_demo.py``).
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Iterable, Optional


PACKAGE_NAME = "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra"
THIS_DIR = Path(__file__).resolve().parent
DEMO_ROOT = THIS_DIR.parent
REPO_ROOT = DEMO_ROOT.parent


def _resolve_main():
    package_name = __package__ or PACKAGE_NAME
    package = importlib.import_module(package_name)

    if hasattr(package, "main"):
        return package.main

    cli = importlib.import_module(f"{package_name}.cli")
    if hasattr(cli, "main"):
        return cli.main

    raise AttributeError(f"{package_name} does not expose a 'main' callable")


def run(argv: Optional[Iterable[str]] = None, *, main_fn=None) -> None:
    """Execute the canonical demo CLI with optional arguments.

    Args:
        argv: Optional iterable of CLI arguments to forward. If omitted, the
            current process arguments (excluding the interpreter and script
            name) are forwarded unchanged.
        main_fn: Optional override for the CLI entrypoint, enabling tests or
            higher-level orchestrators to inject a shim without mutating the
            underlying package state.
    """

    if argv is None:
        argv = sys.argv[1:]

    for path in (REPO_ROOT, DEMO_ROOT):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

    launcher = main_fn or _resolve_main()
    launcher(list(argv))


if __name__ == "__main__":
    run()
