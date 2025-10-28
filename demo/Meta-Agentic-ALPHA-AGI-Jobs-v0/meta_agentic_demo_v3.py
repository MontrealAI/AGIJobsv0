"""Command-line interface for the Meta-Agentic α-AGI Jobs Demo V3."""

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

from meta_agentic_alpha_demo.v3 import load_configuration, run_demo  # noqa: E402  pylint: disable=wrong-import-position


def _default_config_path() -> Path:
    return Path(__file__).resolve().parent / "meta_agentic_alpha_v3" / "config" / "scenario.yaml"


def run_cli(args: argparse.Namespace) -> int:
    config_path = Path(args.config).resolve() if args.config else _default_config_path()
    outcome = run_demo(load_configuration(config_path), timeout=args.timeout)
    alpha_metrics = outcome.metadata if isinstance(outcome.metadata, dict) else {}
    payload = {
        "runId": outcome.run_id,
        "state": outcome.status.run.state,
        "alphaReadiness": alpha_metrics.get("alphaReadiness"),
        "alphaCompoundingIndex": alpha_metrics.get("alphaCompoundingIndex"),
        "summary": str(outcome.summary_path),
        "scoreboard": outcome.scoreboard_snapshot,
        "dashboard": str(outcome.dashboard_path) if outcome.dashboard_path else None,
        "report": str(outcome.report_path) if outcome.report_path else None,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Launch the Meta-Agentic α-AGI Jobs Demo V3 orchestration run.")
    parser.add_argument("--config", help="Path to the V3 scenario YAML configuration file.")
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("META_AGENTIC_DEMO_V3_TIMEOUT", "150")),
        help="Maximum seconds to wait for orchestration completion.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_cli(args)


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
