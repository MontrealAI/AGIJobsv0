"""Executable entrypoint for the Supreme Omega-grade business demo wrapper.

This mirrors the CLI exposed under the canonical Unicode-heavy package while
keeping an ASCII-safe launch path. Operators can run this script directly from
inside ``demo/kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme``
without worrying about ``PYTHONPATH`` gymnastics or their current working
directory.
"""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Iterable, Optional

# Keep demos fast and deterministic when explicitly requested. The canonical
# orchestrator defaults to an infinite run with long validator delays, which can
# feel “stuck” in automated smoke tests. These defaults execute a handful of
# cycles with short validation windows so operators immediately see output and
# generated artifacts without surprising CLI callers.
DEFAULT_DEMO_ARGS = [
    "--cycles",
    "6",
    "--validator_commit_delay_seconds",
    "1",
    "--validator_reveal_delay_seconds",
    "1",
    "--simulation_tick_seconds",
    "1",
    "--checkpoint_interval_seconds",
    "30",
    "--snapshot_interval_seconds",
    "10",
    "--no-resume",
]
FAST_DEFAULTS_ENV = "AGI_SUPREME_FAST_DEFAULTS"

PACKAGE_NAME = "demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme"
THIS_DIR = Path(__file__).resolve().parent
DEMO_ROOT = THIS_DIR.parent
REPO_ROOT = DEMO_ROOT.parent


def _resolve_package():
    package_name = __package__ or PACKAGE_NAME
    return importlib.import_module(package_name)


def _resolve_main(package=None):
    package = package or _resolve_package()

    try:
        return package.main
    except AttributeError as exc:  # pragma: no cover - defensive
        raise AttributeError(f"{package.__name__} does not expose a 'main' callable") from exc


def _resolve_parser(package=None):
    package = package or _resolve_package()
    builder = getattr(package, "build_arg_parser", None)
    if builder is None:
        return None

    parser = builder()
    return parser


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

    argv_provided = argv is not None
    argv_list = sys.argv[1:] if argv is None else list(argv)
    raw_fast_defaults = os.getenv(FAST_DEFAULTS_ENV, "").strip().lower()
    fast_defaults_env = raw_fast_defaults in {"1", "true", "yes", "on"}
    fast_defaults_flag = "--fast-defaults" in argv_list
    if fast_defaults_flag:
        argv_list = [arg for arg in argv_list if arg != "--fast-defaults"]

    if not argv_list and (fast_defaults_env or fast_defaults_flag or argv_provided):
        argv_list = DEFAULT_DEMO_ARGS.copy()
        print(
            "🛰️  Launching Supreme Omega-grade demo with fast defaults "
            f"({', '.join(DEFAULT_DEMO_ARGS)})"
        )

    for path in (REPO_ROOT, DEMO_ROOT):
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

    package = None
    if main_fn is None:
        package = _resolve_package()

    launcher = main_fn or _resolve_main(package)

    if main_fn is None and package is not None:
        parser = _resolve_parser(package)
        default_main = getattr(package, "run_from_cli", None)
        if parser is not None and default_main is not None and launcher is default_main:
            parsed_args = parser.parse_args(argv_list)
            launcher(parsed_args)
            return

    launcher(argv_list)


if __name__ == "__main__":
    run()
