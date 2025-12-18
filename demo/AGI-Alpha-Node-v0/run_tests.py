from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Sequence


def _build_env(demo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    pythonpath = os.pathsep.join(
        segment
        for segment in [str(demo_root), str(demo_root.parent), env.get("PYTHONPATH", "")]
        if segment
    )
    env["PYTHONPATH"] = pythonpath
    return env


def _build_command(args: Sequence[str]) -> list[str]:
    base = [sys.executable, "-m", "pytest"]

    has_positional = any(arg and not arg.startswith("-") for arg in args)
    if args and has_positional:
        return [*base, *args]

    return [*base, *args, "tests"]


def main() -> int:
    demo_root = Path(__file__).resolve().parent
    env = _build_env(demo_root)
    cmd = _build_command(sys.argv[1:])
    process = subprocess.run(cmd, cwd=Path(__file__).parent, env=env)
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
