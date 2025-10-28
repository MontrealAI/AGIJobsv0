"""Run the Meta-Agentic α-AGI Jobs Demo V6 orchestrator."""

from __future__ import annotations

import argparse
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

from meta_agentic_alpha_v6 import DEFAULT_CONFIG_PATH, run_meta_dominion_demo  # noqa: E402  pylint: disable=wrong-import-position


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Meta-Agentic α-AGI Jobs Demo V6")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to the V6 scenario YAML (defaults to the bundled scenario)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=150.0,
        help="Maximum seconds to wait for the orchestrator run",
    )
    parser.add_argument(
        "--timeout-env",
        default=os.environ.get("META_AGENTIC_DEMO_V6_TIMEOUT"),
        help=argparse.SUPPRESS,
    )
    return parser


def format_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    timeout = args.timeout
    if args.timeout_env:
        try:
            timeout = float(args.timeout_env)
        except ValueError:
            pass

    outcome = run_meta_dominion_demo(args.config, timeout=timeout)

    print("\n🎖️ Meta-Agentic α-AGI Jobs Demo V6 completed!")
    print(f"   • Orchestration run ID: {outcome.base.run_id}")
    print(f"   • Run state: {outcome.base.status.run.state}")
    print(
        "   • Alpha compounding index: "
        f"{outcome.dashboard_payload['metrics']['alpha_compounding_index']*100:.2f}%"
    )
    control_surface = outcome.dashboard_payload["control_surface"]
    print(
        "   • Owner command surface: "
        f"{control_surface['score']*100:.2f}% (quorum {control_surface['guardian_quorum']}/"
        f"{control_surface['guardian_count']} primaries + {control_surface['failover_guardian_count']} failover)"
    )
    print("   • Artefacts generated:")
    print(f"       - Latest run payload: {format_path(outcome.summary_path)}")
    print(f"       - Dashboard data:    {format_path(outcome.dashboard_path)}")
    print(f"       - Masterplan deck:   {format_path(outcome.report_path)}")
    print(f"       - Scoreboard:        {format_path(outcome.scoreboard_path)}")
    print("\nOpen the Meta-Dominion Console:")
    print(f"   python -m http.server --directory {format_path(outcome.dashboard_path.parent)} 9006")
    print("   → Visit http://localhost:9006/index.html")
    print("\nModify any lever via scripts/owner_controls.py, rerun this CLI, and the console updates automatically.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
