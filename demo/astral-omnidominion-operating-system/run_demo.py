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
from typing import Callable, Iterable, Protocol


class _Runner(Protocol):
    def __call__(self, cmd: list[str], *, check: bool, cwd: str | os.PathLike[str]) -> subprocess.CompletedProcess:
        ...


REPO_ROOT = Path(__file__).resolve().parents[2]


def build_command(args: Iterable[str]) -> list[str]:
    """Construct the npm command that drives the demo."""

    return ["npm", "run", "demo:agi-os:first-class", "--", *args]


def run(
    argv: Iterable[str] | None = None,
    *,
    runner: _Runner | None = None,
    is_interactive: Callable[[], bool] | None = None,
) -> int:
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

    # Default to a fully automated localhost rehearsal when stdin is not a TTY.
    # This keeps CI and headless runs from hanging on interactive prompts while
    # preserving the existing behaviour for humans running the demo directly.
    is_interactive = is_interactive or sys.stdin.isatty
    if not args and not is_interactive():
        args = ["--network", "localhost", "--yes", "--no-compose", "--skip-deploy"]
    cmd = build_command(args)
    runner = runner or subprocess.run
    result = runner(cmd, check=False, cwd=str(REPO_ROOT))
    return result.returncode


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
