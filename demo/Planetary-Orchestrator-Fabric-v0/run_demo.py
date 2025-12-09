"""CLI entry point for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from planetary_fabric.simulation import run_high_load_blocking


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Planetary Orchestrator Fabric demo simulation.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path.cwd(),
        help="Base directory for checkpoints and telemetry.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=3_000,
        help="Number of jobs to simulate across shards.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=1337,
        help="Seed for deterministic orchestration and job generation.",
    )
    parser.add_argument(
        "--no-restart",
        action="store_true",
        help="Disable the orchestrator restart scenario.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    result = run_high_load_blocking(
        args.base_dir,
        job_count=args.jobs,
        kill_and_resume=not args.no_restart,
        seed=args.seed,
    )
    output = {
        "completion_rate": result.completion_rate,
        "max_depth_delta": result.max_depth_delta(),
        "reassigned_jobs": result.reassigned_jobs,
        "total_runtime": result.total_runtime,
    }
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
