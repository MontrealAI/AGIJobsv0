"""Executable entrypoint for the Supreme Omega-grade business demo wrapper.

This mirrors the CLI exposed under the canonical Unicode-heavy package while
keeping an ASCII-safe launch path. Operators can run this script directly from
inside ``demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme``
without worrying about ``PYTHONPATH`` gymnastics or their current working
directory.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Iterable, Optional

PACKAGE_NAME = "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme"
THIS_DIR = Path(__file__).resolve().parent
DEMO_ROOT = THIS_DIR.parent
REPO_ROOT = DEMO_ROOT.parent


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

    for path in (REPO_ROOT, DEMO_ROOT):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

    launcher = main_fn or _resolve_main()
    launcher(list(argv))


if __name__ == "__main__":
    run()
