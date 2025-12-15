"""Entry point for the Astral Omnidominion Operating System demo.

This wrapper keeps the execution experience consistent with other demos by
invoking the underlying TypeScript implementation via ``npm run``. It is
intentionally lightweight: the Python layer only assembles the command,
ensures we execute from the repository root, and forwards any user-supplied
arguments verbatim.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Protocol


class _Runner(Protocol):
    def __call__(self, cmd: list[str], *, check: bool, cwd: str | os.PathLike[str]) -> subprocess.CompletedProcess:
        ...


REPO_ROOT = Path(__file__).resolve().parents[2]


def build_command(args: Iterable[str]) -> list[str]:
    """Construct the npm command that drives the demo."""

    return ["npm", "run", "demo:agi-os:first-class", "--", *args]


def run(argv: Iterable[str] | None = None, *, runner: _Runner | None = None) -> int:
    """Execute the Astral Omnidominion demo through npm.

    Args:
        argv: Optional iterable of CLI arguments to forward to the demo.
        runner: Optional callable used to execute the command. Defaults to
            :func:`subprocess.run` and primarily exists to keep tests fast and
            deterministic.

    Returns:
        The exit code from the underlying npm script.
    """

    args = list(argv) if argv is not None else sys.argv[1:]
    cmd = build_command(args)
    runner = runner or subprocess.run
    result = runner(cmd, check=False, cwd=str(REPO_ROOT))
    return result.returncode


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
