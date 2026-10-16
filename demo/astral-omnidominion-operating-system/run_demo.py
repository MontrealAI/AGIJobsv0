"""Plan-first Python entry point for the Astral Omnidominion demo.

Plan and help are rendered locally without invoking npm or inspecting the
runtime. Only an explicit, fully specified execute request reaches the injected
runner; valid execution arguments are forwarded unchanged.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable, NamedTuple, Protocol


class _Runner(Protocol):
    def __call__(self, cmd: list[str], *, check: bool, cwd: str | os.PathLike[str]) -> subprocess.CompletedProcess:
        ...


REPO_ROOT = Path(__file__).resolve().parents[2]
_HELP_FLAGS = frozenset({"-h", "-?", "--help"})
_VALUE_FLAGS = frozenset({"--mode", "--network"})
_BOOLEAN_FLAGS = frozenset(
    {"--dry-run", "--yes", "--non-interactive", "--compose", "--no-compose", "--skip-deploy"}
)


class _Options(NamedTuple):
    mode: str = "plan"
    network: str | None = None
    compose: bool | None = None
    skip_deploy: bool = False
    yes: bool = False
    help: bool = False


def _parse_args(args: list[str]) -> _Options:
    """Validate the complete argument list before any operational work."""

    if any(arg in _HELP_FLAGS for arg in args):
        if len(args) != 1:
            raise ValueError("Help (-h, -?, --help) must be used alone.")
        return _Options(help=True)

    values: dict[str, str | bool] = {}
    index = 0
    while index < len(args):
        flag = args[index]
        if flag not in _VALUE_FLAGS and flag not in _BOOLEAN_FLAGS:
            raise ValueError(f"Unknown argument: {flag!r}. Use --help for supported options.")
        if flag in values:
            raise ValueError(f"Duplicate option: {flag}.")
        if flag in _VALUE_FLAGS:
            if index + 1 >= len(args) or args[index + 1].startswith("-"):
                raise ValueError(f"{flag} requires a value.")
            values[flag] = args[index + 1]
            index += 2
        else:
            values[flag] = True
            index += 1

    if "--mode" in values and "--dry-run" in values:
        raise ValueError("--dry-run is an alias for plan; do not combine it with --mode.")
    mode = values.get("--mode", "plan")
    if mode not in {"plan", "execute"}:
        raise ValueError("--mode must be plan or execute.")
    network = values.get("--network")
    if network is not None and network not in {"localhost", "sepolia"}:
        raise ValueError("--network must be localhost or sepolia.")
    if "--compose" in values and "--no-compose" in values:
        raise ValueError("--compose and --no-compose cannot be combined.")
    if "--skip-deploy" in values and "--compose" in values:
        raise ValueError("--skip-deploy cannot be combined with --compose.")

    compose = True if "--compose" in values else False if "--no-compose" in values else None
    yes = "--yes" in values
    if mode == "execute":
        if network is None:
            raise ValueError("Execute requires an explicit --network localhost or --network sepolia.")
        if compose is None:
            raise ValueError("Execute requires exactly one of --compose or --no-compose.")
        if not yes:
            raise ValueError("Execute requires --yes; --non-interactive, environment variables and TTY state are not consent.")

    return _Options(
        mode=str(mode),
        network=str(network) if network is not None else None,
        compose=compose,
        skip_deploy="--skip-deploy" in values,
        yes=yes,
    )


def build_command(args: Iterable[str]) -> list[str]:
    """Return exact npm argv after validation; raise ValueError on invalid input.

    This function only constructs a command. ``run`` handles plan and help
    locally and never submits those commands to a runner.
    """

    original_args = list(args)
    _parse_args(original_args)
    return ["npm", "run", "demo:agi-os:first-class", "--", *original_args]


def _print_help() -> None:
    print(
        "Astral Omnidominion Operating System Demo\n"
        "\nUsage: python run_demo.py [options]\n"
        "\nOptions:\n"
        "  --mode plan|execute       Default: plan (effect-free preview).\n"
        "  --dry-run                 Exact alias for plan; cannot accompany --mode.\n"
        "  --network localhost|sepolia\n"
        "                            Required explicitly for execute.\n"
        "  --compose | --no-compose  Exactly one is required for execute.\n"
        "  --yes                     Explicit consent required for execute.\n"
        "  --non-interactive         Never substitutes for --yes.\n"
        "  --skip-deploy             Skip only the first-class deployment wizard.\n"
        "                            Incompatible with --compose.\n"
        "  -h, -?, --help            Show help; must be used alone.\n"
        "\nUnknown, positional, duplicate and --option=value arguments are rejected.\n"
        "CI, ASTRAL_OS_AUTO and terminal state do not authorize execution.\n"
        "--auto and --auto-yes are unsupported.\n"
        "Plan/help do not launch subprocesses, use RPC, deploy or create reports.\n"
        "--skip-deploy skips only the first-class deployment wizard; owner/runtime commands still run.\n"
        "The bundled rehearsal is a separate in-memory Hardhat fixture; it does not\n"
        "verify the selected localhost/Sepolia deployment.\n"
        "The Sepolia outer path is available in source but remains operationally unqualified.\n"
        "\nExamples:\n"
        "  python run_demo.py\n"
        "  python run_demo.py --dry-run --network sepolia --no-compose\n"
        "  python run_demo.py --mode execute --network localhost --no-compose --yes"
    )


def _print_plan(options: _Options) -> None:
    network = options.network or "not selected (required for execute)"
    compose = {True: "enabled", False: "disabled", None: "not selected (required for execute)"}[options.compose]
    deployment = "first-class wizard skipped by --skip-deploy" if options.skip_deploy else "would run the first-class deployment wizard"
    print(
        "Astral Omnidominion Operating System: plan (effect-free preview)\n"
        f"Network: {network}\n"
        f"Docker Compose: {compose}\n"
        f"Deployment: {deployment}\n"
        "Execution would perform preflight checks, run the bundled rehearsal,\n"
        "run selected-target owner commands, and generate mission reports and manifests.\n"
        "The bundled rehearsal is a separate in-memory Hardhat fixture; it does not\n"
        "verify the selected localhost/Sepolia deployment.\n"
        "The Sepolia outer path is available in source but remains operationally unqualified.\n"
        "No subprocesses, RPC calls, deployment, filesystem writes or reports are performed in plan mode.\n"
        "Runtime prerequisites and network connectivity have not been checked.\n"
        "To execute, explicitly provide --mode execute, --network localhost|sepolia,\n"
        "exactly one of --compose/--no-compose, and --yes.\n"
        "--skip-deploy skips only the first-class deployment wizard; owner/runtime commands still run."
    )


def run(
    argv: Iterable[str] | None = None,
    *,
    runner: _Runner | None = None,
    is_interactive: Callable[[], bool] | None = None,
) -> int:
    """Render plan/help locally or execute an explicitly authorized command.

    ``runner`` keeps execution injectable for tests. ``is_interactive`` remains
    accepted for compatibility, but is never called or used as consent.
    Invalid arguments return 2; execution returns the runner's exit code.
    """

    args = list(argv) if argv is not None else sys.argv[1:]
    try:
        options = _parse_args(args)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2

    if options.help:
        _print_help()
        return 0
    if options.mode == "plan":
        _print_plan(options)
        return 0

    cmd = build_command(args)
    execute = runner if runner is not None else subprocess.run
    result = execute(cmd, check=False, cwd=str(REPO_ROOT))
    return result.returncode


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
