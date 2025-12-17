"""ASCII-safe launcher for the Omega-grade Kardashev-II α-AGI business demo.

This mirrors the ergonomics of ``python -m demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega``
while letting operators run the demo directly from the ASCII directory. It
mirrors the existing wrapper pattern used by the non-Omega variant so scripts
and CI jobs can share a consistent entrypoint surface.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Iterable, Optional

PACKAGE_NAME = "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega"
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
    """Execute the canonical demo CLI with optional arguments."""

    if argv is None:
        argv = sys.argv[1:]

    for path in (REPO_ROOT, DEMO_ROOT):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

    launcher = main_fn or _resolve_main()
    launcher(list(argv))


if __name__ == "__main__":  # pragma: no cover - script execution entry
    run()
