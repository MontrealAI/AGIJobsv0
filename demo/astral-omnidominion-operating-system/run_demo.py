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
DEFAULT_ARGS = ["--network", "localhost", "--yes", "--no-compose", "--skip-deploy"]
AUTO_FLAG = "--auto"
AUTO_ENV = "ASTRAL_OS_AUTO"


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

    normalized_args, _ = _normalize_args(args, is_interactive)
    cmd = build_command(normalized_args)
    runner = runner or subprocess.run
    result = runner(cmd, check=False, cwd=str(REPO_ROOT))
    return result.returncode


def _normalize_args(
    args: list[str], is_interactive: Callable[[], bool] | None
) -> tuple[list[str], bool]:
    """Apply automation defaults while respecting explicit caller intent."""

    is_interactive = is_interactive or sys.stdin.isatty

    requested = _auto_requested(args)
    args = [arg for arg in args if arg != AUTO_FLAG]

    if not args:
        if requested or not is_interactive():
            return DEFAULT_ARGS, requested
        return args, requested

    if requested:
        args = _merge_defaults(args)

    return args, requested


def _auto_requested(args: Iterable[str]) -> bool:
    env_value = os.environ.get(AUTO_ENV, "").strip().lower()
    env_requested = env_value in {"1", "true", "yes", "on"}
    return AUTO_FLAG in args or env_requested


def _merge_defaults(args: list[str]) -> list[str]:
    """Ensure automation defaults are present without clobbering overrides."""

    def _has_flag(flag: str, values: list[str]) -> bool:
        if flag == "--network":
            return any(value == flag or value.startswith(f"{flag}=") for value in values)
        return flag in values

    merged: list[str] = []
    merged.extend(args)

    if not _has_flag("--network", merged):
        merged.extend(["--network", "localhost"])
    for flag in ["--yes", "--no-compose", "--skip-deploy"]:
        if not _has_flag(flag, merged):
            merged.append(flag)

    return merged


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
