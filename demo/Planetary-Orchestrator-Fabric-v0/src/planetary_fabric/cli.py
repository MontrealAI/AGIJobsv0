"""Command line interface for the Planetary Orchestrator Fabric demo."""
from __future__ import annotations

import argparse
import json
import sys
import textwrap
from pathlib import Path
from typing import Dict, Optional

from .config import DEFAULT_SCENARIOS, ScenarioConfig, load_custom_config, load_scenario
from .orchestrator import PlanetaryOrchestratorFabric


def _human_banner(title: str) -> str:
    border = "=" * len(title)
    return f"\n{border}\n{title}\n{border}\n"


def _display_summary(results: Dict[str, object]) -> str:
    lines = ["\nFabric Execution Summary", "------------------------"]
    lines.append(f"Dispatched: {results['dispatched']}")
    lines.append(f"Completed: {results['completed']}")
    lines.append(f"Failed: {results['failed']}")
    lines.append(f"Reassigned: {results['reassigned']}")
    lines.append(f"Spillovers: {results['spillovers']}")
    lines.append("Queue Depths:")
    for shard, depth in results.get("queue_depths", {}).items():
        lines.append(f"  - {shard}: {depth}")
    lines.append("Loaded from checkpoint: {}".format(results.get("loaded_from_checkpoint", False)))
    return "\n".join(lines)


def run_scenario(config: ScenarioConfig, resume: bool = False, export_report: Optional[str] = None) -> Dict[str, object]:
    fabric = PlanetaryOrchestratorFabric(checkpoint_path=config.checkpoint_path)
    fabric.bootstrap_demo_nodes()
    if resume:
        fabric.load_checkpoint()
    else:
        fabric.clear_checkpoint()
    fabric.bootstrap_jobs(config.job_count, shards=config.shards)
    results = fabric.simulate_execution(max_ticks=int(config.duration_seconds * 10), completion_probability=config.completion_probability)
    checkpoint_path = fabric.save_checkpoint()
    results["checkpoint"] = checkpoint_path
    results["governance"] = fabric.governance_snapshot()
    results["health"] = fabric.health_report()
    if export_report:
        report_path = Path(export_report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open("w", encoding="utf-8") as fp:
            json.dump(results, fp, indent=2, sort_keys=True)
    return results


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="planetary-fabric",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(
            """
            Planetary Orchestrator Fabric demo
            ----------------------------------
            Launch Kardashev-II grade orchestrations with a single command.
            """
        ),
    )
    parser.add_argument("scenario", nargs="?", default="edge-relief", choices=list(DEFAULT_SCENARIOS.keys()), help="Scenario to run")
    parser.add_argument("--resume", action="store_true", help="Resume from existing checkpoint if available")
    parser.add_argument("--export", type=str, help="Optional path to write JSON report")
    parser.add_argument("--custom", type=str, help="Path to custom scenario JSON file")
    parser.add_argument("--jobs", type=int, help="Override job count for the selected scenario")
    parser.add_argument("--completion", type=float, help="Override completion probability (0-1)")
    parser.add_argument("--duration", type=float, help="Override duration seconds multiplier")

    args = parser.parse_args(argv)

    if args.custom:
        config = load_custom_config(args.custom)
    else:
        overrides = {}
        if args.jobs is not None:
            overrides["job_count"] = args.jobs
        if args.completion is not None:
            overrides["completion_probability"] = args.completion
        if args.duration is not None:
            overrides["duration_seconds"] = args.duration
        config = load_scenario(args.scenario, overrides)

    print(_human_banner(config.name))
    print(textwrap.fill(config.description, width=80))
    results = run_scenario(config, resume=args.resume, export_report=args.export)
    print(_display_summary(results))
    if args.export:
        print(f"\nReport saved to {args.export}")
    print(f"Checkpoint stored at {results['checkpoint']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
