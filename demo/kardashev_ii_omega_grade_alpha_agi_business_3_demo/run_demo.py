"""Executable entrypoint for the Omega-grade business demo wrapper.

This keeps a frictionless launch path from the ASCII-safe directory while
forwarding into the canonical CLI defined under the unicode-heavy
``Kardashev-II Omega-Grade-α-AGI Business-3`` package. It mirrors the existing
``python -m ...`` experience but also lets operators execute
``python demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo/run_demo.py``
without having to navigate the nested directory structure.
"""
from __future__ import annotations

import importlib
import sys
from typing import Iterable, Optional


PACKAGE_NAME = "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo"


def _resolve_main():
    package_name = __package__ or PACKAGE_NAME
    package = importlib.import_module(package_name)

    try:
        return package.main
    except AttributeError as exc:  # pragma: no cover - defensive
        raise AttributeError(f"{package_name} does not expose a 'main' callable") from exc


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

    launcher = main_fn or _resolve_main()
    launcher(list(argv))


if __name__ == "__main__":
    run()
