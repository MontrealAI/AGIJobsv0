"""Run Alpha Node demo tests with a clean, deterministic pytest environment.

This runner pins the PYTHONPATH to the repository root so our local
compatibility shims (for example ``eth_typing.py``) are discovered before any
third-party packages. It also disables pytest's plugin autoloading to prevent
globally installed plugins from injecting unwanted dependencies.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Sequence


# Resolve to the repository root (``.../AGIJobsv0``), not the ``demo`` folder.
REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_PATH = Path(__file__).resolve().parent / "tests"


def _build_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    # Ensure our repository-level shims and modules take precedence over any
    # globally installed packages (notably the eth_typing compatibility shim).
    env["PYTHONPATH"] = str(REPO_ROOT)
    return env


def run_pytest(args: Sequence[str]) -> int:
    cmd = ["python", "-m", "pytest", *args, str(TEST_PATH)]
    process = subprocess.run(cmd, env=_build_env())
    return process.returncode


def main() -> None:
    exit_code = run_pytest([])
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
