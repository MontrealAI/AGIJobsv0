from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Sequence


def _build_env(repo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    env.setdefault("PYTHONPATH", str(repo_root))
    return env


def _build_command(args: Sequence[str]) -> list[str]:
    base = [sys.executable, "-m", "pytest"]
    if args:
        return [*base, *args]
    return [*base, "tests"]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    env = _build_env(repo_root)
    cmd = _build_command(sys.argv[1:])
    process = subprocess.run(cmd, cwd=Path(__file__).parent, env=env)
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
