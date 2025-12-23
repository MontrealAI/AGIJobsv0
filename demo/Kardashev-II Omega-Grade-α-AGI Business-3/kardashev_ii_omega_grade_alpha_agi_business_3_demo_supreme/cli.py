"""Command line interface for the Omega-grade demo."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Optional

from .config import SupremeDemoConfig, update_config_from_args
from .orchestrator import SupremeOrchestrator


class _PathArg(argparse.Action):
    def __call__(self, parser, namespace, values, option_string=None):
        setattr(namespace, self.dest, Path(values))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme",
        description="Run the Supreme Omega-grade Kardashev-II orchestrator demo.",
    )
    parser.add_argument("--cycles", type=int, default=None, help="Number of cycles to run (0 for infinite).")
    parser.add_argument("--checkpoint_path", action=_PathArg, help="Where to persist orchestrator state.")
    parser.add_argument("--log_path", action=_PathArg, help="Structured log output location.")
    parser.add_argument("--bus_history_path", action=_PathArg, help="Message bus archive path.")
    parser.add_argument("--owner_control_path", action=_PathArg, help="Owner control command file.")
    parser.add_argument("--owner_ack_path", action=_PathArg, help="Owner command acknowledgement file.")
    parser.add_argument("--structured_log_level", help="Structured logging level (INFO, DEBUG, ...).")
    parser.add_argument(
        "--checkpoint_interval_seconds",
        type=int,
        default=None,
        help="How often to checkpoint orchestrator state (seconds).",
    )
    parser.add_argument(
        "--snapshot_interval_seconds",
        type=int,
        default=None,
        help="Interval for metrics snapshots (seconds).",
    )
    parser.add_argument("--validators", type=int, default=None, help="Number of validator agents to spawn.")
    parser.add_argument("--mission_hours", type=float, default=None, help="Target mission horizon in hours.")
    parser.add_argument("--default_reward", type=int, default=None, help="Default reward for generated jobs.")
    parser.add_argument("--default_stake_ratio", type=float, default=None, help="Stake ratio applied to jobs.")
    parser.add_argument("--energy_reserve", type=float, default=None, help="Planetary energy reserve.")
    parser.add_argument("--compute_reserve", type=float, default=None, help="Planetary compute reserve.")
    parser.add_argument("--token_supply", type=int, default=None, help="Initial AGI token supply.")
    parser.add_argument(
        "--validator_commit_delay_seconds",
        type=int,
        default=None,
        help="Commit phase duration for validators (seconds).",
    )
    parser.add_argument(
        "--validator_reveal_delay_seconds",
        type=int,
        default=None,
        help="Reveal phase duration for validators (seconds).",
    )
    parser.add_argument(
        "--simulation_tick_seconds",
        type=int,
        default=None,
        help="Planetary simulation tick interval (seconds).",
    )
    parser.add_argument("--resume_from_checkpoint", action="store_true", help="Resume orchestrator from checkpoint when available.")
    parser.add_argument("--no-resume", dest="resume_from_checkpoint", action="store_false", help="Ignore existing checkpoints and start fresh.")
    parser.add_argument("--enable_simulation", action="store_true", help="Enable synthetic planetary simulation.")
    parser.add_argument("--disable_simulation", dest="enable_simulation", action="store_false", help="Disable planetary simulation hooks.")
    parser.add_argument(
        "--simulation_plugins",
        nargs="*",
        default=None,
        help="Optional dotted paths to simulation plugins to load.",
    )
    parser.add_argument("--structured_metrics_path", action=_PathArg, help="Where to write structured metrics snapshots.")
    parser.add_argument("--mermaid_dashboard_path", action=_PathArg, help="Path for generated Mermaid dashboard diagram.")
    parser.add_argument("--job_history_path", action=_PathArg, help="File used to store job history entries.")
    parser.set_defaults(resume_from_checkpoint=None, enable_simulation=None)
    return parser


def _build_config_from_args(args: argparse.Namespace) -> SupremeDemoConfig:
    config = SupremeDemoConfig()
    update_config_from_args(config, args)
    config.ensure_directories()
    return config


async def _run_and_report(config: SupremeDemoConfig) -> None:
    orchestrator = SupremeOrchestrator(config)
    await orchestrator.run()
    snapshot = orchestrator.status_snapshot()
    print(
        "\n✅ Supreme Omega-grade demo completed.",
        f"Cycles: {snapshot['cycles']}",
        f"Jobs posted: {snapshot['jobs_total']} (active {snapshot['jobs_active']})",
        sep="\n",
    )
    print(
        "Artifacts:",
        f" - Structured logs: {snapshot['log_path']}",
        f" - Metrics snapshot: {snapshot['metrics_path']}",
        f" - Mermaid dashboard: {snapshot['dashboard_path']}",
        f" - Job history: {snapshot['job_history_path']}",
        sep="\n",
    )


def run_from_cli(args: Optional[argparse.Namespace] = None) -> None:
    parser = build_arg_parser()
    parsed = args or parser.parse_args()
    config = _build_config_from_args(parsed)
    asyncio.run(_run_and_report(config))


__all__ = ["build_arg_parser", "run_from_cli"]
