"""Command line interface for the Omega-grade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import timedelta
from pathlib import Path
from typing import Optional

from .governance import GovernanceParameters
from .orchestrator import Orchestrator, OrchestratorConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Kardashev-II Omega-Grade α-AGI Business 3 demo")
    parser.add_argument("--cycles", type=int, default=0, help="Number of cycles to execute (0 = run indefinitely)")
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoint.json"), help="Path to checkpoint file")
    parser.add_argument("--no-resume", action="store_true", help="Do not resume from checkpoint")
    parser.add_argument("--no-sim", action="store_true", help="Disable the synthetic planetary simulation")
    parser.add_argument("--control", type=Path, default=Path("control-channel.jsonl"), help="Control channel file path")
    parser.add_argument("--insight-interval", type=int, default=30, help="Seconds between strategic insight broadcasts")
    parser.add_argument("--simulation-tick", type=float, default=1.0, help="Seconds between simulation updates")
    parser.add_argument(
        "--simulation-hours", type=float, default=1.0, help="In-simulation hours progressed per tick"
    )
    parser.add_argument(
        "--simulation-energy-scale",
        type=float,
        default=2.0,
        help="Multiplier converting GW output into available energy capacity",
    )
    parser.add_argument(
        "--simulation-compute-scale",
        type=float,
        default=1.0,
        help="Multiplier applied to prosperity/sustainability derived compute capacity",
    )
    parser.add_argument("--audit-log", type=Path, help="JSONL audit log output path")
    parser.add_argument(
        "--status-output",
        type=Path,
        help="Optional JSONL file receiving continuous status snapshots",
    )
    parser.add_argument("--config", type=Path, help="Optional JSON file overriding orchestrator configuration")
    return parser


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


async def _run_async(args: argparse.Namespace) -> None:
    overrides = {}
    if args.config:
        if not args.config.exists():
            raise FileNotFoundError(f"Config file not found: {args.config}")
        data = json.loads(args.config.read_text(encoding="utf-8"))
        for path_field in ("checkpoint_path", "control_channel_file", "audit_log_path", "status_output_path"):
            if path_field in data and data[path_field] is not None:
                data[path_field] = Path(data[path_field])
        if "governance" in data:
            gov_data = dict(data["governance"])
            if "validator_commit_window" in gov_data:
                gov_data["validator_commit_window"] = timedelta(seconds=float(gov_data["validator_commit_window"]))
            if "validator_reveal_window" in gov_data:
                gov_data["validator_reveal_window"] = timedelta(seconds=float(gov_data["validator_reveal_window"]))
            data["governance"] = GovernanceParameters(**gov_data)
        overrides.update(data)

    params = {
        "max_cycles": args.cycles or None,
        "checkpoint_path": args.checkpoint,
        "resume_from_checkpoint": not args.no_resume,
        "enable_simulation": not args.no_sim,
        "control_channel_file": args.control,
        "insight_interval_seconds": args.insight_interval,
        "simulation_tick_seconds": args.simulation_tick,
        "simulation_hours_per_tick": args.simulation_hours,
        "simulation_energy_scale": args.simulation_energy_scale,
        "simulation_compute_scale": args.simulation_compute_scale,
        "audit_log_path": args.audit_log,
        "status_output_path": args.status_output,
    }
    params.update(overrides)

    config = OrchestratorConfig(**params)
    orchestrator = Orchestrator(config)
    try:
        await orchestrator.start()
        await orchestrator.wait_until_stopped()
    finally:
        await orchestrator.shutdown()


def main(argv: Optional[list[str]] = None) -> None:
    args = parse_args(argv)
    try:
        asyncio.run(_run_async(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
