"""Command-line interface for the Meta-Agentic α-AGI Jobs demo."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _ensure_python_path() -> None:
    base_dir = Path(__file__).resolve().parent
    python_dir = base_dir / "python"
    if python_dir.exists() and str(python_dir) not in sys.path:
        sys.path.insert(0, str(python_dir))
    repo_root = base_dir.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))


_ensure_python_path()

from meta_agentic_alpha_demo import load_configuration, run_demo


def _default_config_path() -> Path:
    return Path(__file__).resolve().parent / "config" / "meta_agentic_scenario.yaml"


def run_cli(args: argparse.Namespace) -> int:
    config_path = Path(args.config).resolve() if args.config else _default_config_path()
    outcome = run_demo(load_configuration(config_path), timeout=args.timeout)
    print(json.dumps(
        {
            "runId": outcome.run_id,
            "state": outcome.status.run.state,
            "summary": str(outcome.summary_path),
            "scoreboard": outcome.scoreboard_snapshot,
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Launch the Meta-Agentic α-AGI Jobs demo orchestration run.")
    parser.add_argument("--config", help="Path to the demo YAML configuration file.")
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("META_AGENTIC_DEMO_TIMEOUT", "60")),
        help="Maximum seconds to wait for orchestration completion.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_cli(args)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
