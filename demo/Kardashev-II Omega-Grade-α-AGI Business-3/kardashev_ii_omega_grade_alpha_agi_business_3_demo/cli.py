"""Command line interface for the Omega-grade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import timedelta
from pathlib import Path
from typing import Any, Optional

from .governance import GovernanceParameters
from .orchestrator import Orchestrator, OrchestratorConfig

DEFAULT_CYCLES = 5
DEFAULT_CHECKPOINT = Path("checkpoint.json")
DEFAULT_CONTROL = Path("control-channel.jsonl")
DEFAULT_INSIGHT_INTERVAL = 30
DEFAULT_SIMULATION_TICK = 1.0
DEFAULT_SIMULATION_HOURS = 1.0
DEFAULT_SIMULATION_ENERGY_SCALE = 2.0
DEFAULT_SIMULATION_COMPUTE_SCALE = 1.0
DEFAULT_HEARTBEAT_INTERVAL = 5.0
DEFAULT_HEARTBEAT_TIMEOUT = 30.0
DEFAULT_HEALTH_CHECK_INTERVAL = 5.0
DEFAULT_INTEGRITY_INTERVAL = 30.0
DEFAULT_ENERGY_ORACLE_INTERVAL = 60.0
DEFAULT_POLICY_ACTION_INTERVAL = 10.0
DEFAULT_AUTO_POLICY_ACTIONS = True

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "default.json"


def _require_positive(value: float, *, field: str, allow_zero: bool = False) -> None:
    """Validate that numeric CLI arguments remain within safe bounds.

    Args:
        value: The numeric value to validate.
        field: Human-readable field label for error messages.
        allow_zero: Whether zero is considered a valid value.

    Raises:
        ValueError: If the value is outside the allowed range.
    """

    if allow_zero:
        if value < 0:
            raise ValueError(f"{field} must be non-negative (got {value})")
    else:
        if value <= 0:
            raise ValueError(f"{field} must be positive (got {value})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Kardashev-II Omega-Grade α-AGI Business 3 demo")
    parser.add_argument(
        "--cycles",
        type=int,
        default=DEFAULT_CYCLES,
        help="Number of cycles to execute (0 = run indefinitely). Default keeps demo runs finite.",
    )
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT, help="Path to checkpoint file")
    parser.add_argument("--no-resume", action="store_true", help="Do not resume from checkpoint")
    parser.add_argument("--no-sim", action="store_true", help="Disable the synthetic planetary simulation")
    parser.add_argument("--control", type=Path, default=DEFAULT_CONTROL, help="Control channel file path")
    parser.add_argument(
        "--insight-interval",
        type=int,
        default=DEFAULT_INSIGHT_INTERVAL,
        help="Seconds between strategic insight broadcasts",
    )
    parser.add_argument(
        "--simulation-tick",
        type=float,
        default=DEFAULT_SIMULATION_TICK,
        help="Seconds between simulation updates",
    )
    parser.add_argument(
        "--simulation-hours",
        type=float,
        default=DEFAULT_SIMULATION_HOURS,
        help="In-simulation hours progressed per tick",
    )
    parser.add_argument(
        "--simulation-energy-scale",
        type=float,
        default=DEFAULT_SIMULATION_ENERGY_SCALE,
        help="Multiplier converting GW output into available energy capacity",
    )
    parser.add_argument(
        "--simulation-compute-scale",
        type=float,
        default=DEFAULT_SIMULATION_COMPUTE_SCALE,
        help="Multiplier applied to prosperity/sustainability derived compute capacity",
    )
    parser.add_argument(
        "--heartbeat-interval",
        type=float,
        default=DEFAULT_HEARTBEAT_INTERVAL,
        help="Seconds between agent heartbeat broadcasts",
    )
    parser.add_argument(
        "--heartbeat-timeout",
        type=float,
        default=DEFAULT_HEARTBEAT_TIMEOUT,
        help="Seconds before agents are flagged as unresponsive",
    )
    parser.add_argument(
        "--health-check-interval",
        type=float,
        default=DEFAULT_HEALTH_CHECK_INTERVAL,
        help="Seconds between orchestrator health scans",
    )
    parser.add_argument(
        "--integrity-interval",
        type=float,
        default=DEFAULT_INTEGRITY_INTERVAL,
        help="Seconds between autonomous integrity verification sweeps",
    )
    parser.add_argument("--audit-log", type=Path, help="JSONL audit log output path")
    parser.add_argument(
        "--status-output",
        type=Path,
        help="Optional JSONL file receiving continuous status snapshots",
    )
    parser.add_argument(
        "--energy-oracle",
        type=Path,
        help="Optional JSONL file receiving energy oracle telemetry",
    )
    parser.add_argument(
        "--energy-oracle-interval",
        type=float,
        default=DEFAULT_ENERGY_ORACLE_INTERVAL,
        help="Seconds between energy oracle telemetry updates",
    )
    parser.add_argument(
        "--auto-policy-actions",
        action=argparse.BooleanOptionalAction,
        default=DEFAULT_AUTO_POLICY_ACTIONS,
        help="Enable autonomous policy actions based on simulation metrics",
    )
    parser.add_argument(
        "--policy-action-interval",
        type=float,
        default=DEFAULT_POLICY_ACTION_INTERVAL,
        help="Seconds between autonomous policy actions",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help=(
            "Optional JSON file overriding orchestrator configuration "
            f"(defaults to {DEFAULT_CONFIG_PATH.as_posix()})"
        ),
    )
    return parser


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def build_config(args: argparse.Namespace, overrides: Optional[dict[str, Any]] = None) -> OrchestratorConfig:
    """Construct the orchestrator configuration from CLI args.

    Exposed for tests so the default lifecycle (finite by default, opt-in infinite)
    stays verifiable without driving the full async runtime.
    """

    overrides = overrides or {}
    config_path = args.config or (DEFAULT_CONFIG_PATH if DEFAULT_CONFIG_PATH.exists() else None)
    if config_path:
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        data = json.loads(config_path.read_text(encoding="utf-8"))
        config_base = (
            DEFAULT_CONFIG_PATH.parent.parent if config_path == DEFAULT_CONFIG_PATH else config_path.parent
        )
        for path_field in (
            "checkpoint_path",
            "control_channel_file",
            "audit_log_path",
            "status_output_path",
            "energy_oracle_path",
        ):
            if path_field in data and data[path_field] is not None:
                candidate = Path(data[path_field])
                if not candidate.is_absolute():
                    candidate = config_base / candidate
                data[path_field] = candidate
        if "governance" in data:
            gov_data = dict(data["governance"])
            if "validator_commit_window" in gov_data:
                gov_data["validator_commit_window"] = timedelta(seconds=float(gov_data["validator_commit_window"]))
            if "validator_reveal_window" in gov_data:
                gov_data["validator_reveal_window"] = timedelta(seconds=float(gov_data["validator_reveal_window"]))
            data["governance"] = GovernanceParameters(**gov_data)
        overrides.update(data)

    checkpoint_interval = OrchestratorConfig.checkpoint_interval_seconds
    cycle_sleep = OrchestratorConfig.cycle_sleep_seconds
    params = {
        "max_cycles": args.cycles or None,
        "checkpoint_path": args.checkpoint,
        "checkpoint_interval_seconds": checkpoint_interval,
        "resume_from_checkpoint": not args.no_resume,
        "enable_simulation": not args.no_sim,
        "control_channel_file": args.control,
        "insight_interval_seconds": args.insight_interval,
        "simulation_tick_seconds": args.simulation_tick,
        "simulation_hours_per_tick": args.simulation_hours,
        "simulation_energy_scale": args.simulation_energy_scale,
        "simulation_compute_scale": args.simulation_compute_scale,
        "cycle_sleep_seconds": cycle_sleep,
        "audit_log_path": args.audit_log,
        "status_output_path": args.status_output,
        "energy_oracle_path": args.energy_oracle,
        "energy_oracle_interval_seconds": args.energy_oracle_interval,
        "auto_policy_actions": args.auto_policy_actions,
        "policy_action_interval_seconds": args.policy_action_interval,
        "heartbeat_interval_seconds": args.heartbeat_interval,
        "heartbeat_timeout_seconds": args.heartbeat_timeout,
        "health_check_interval_seconds": args.health_check_interval,
        "integrity_check_interval_seconds": args.integrity_interval,
    }

    params.update(overrides)
    cli_overrides: dict[str, Any] = {}
    if args.cycles != DEFAULT_CYCLES:
        cli_overrides["max_cycles"] = args.cycles or None
    if args.checkpoint != DEFAULT_CHECKPOINT:
        cli_overrides["checkpoint_path"] = args.checkpoint
    if args.no_resume:
        cli_overrides["resume_from_checkpoint"] = False
    if args.no_sim:
        cli_overrides["enable_simulation"] = False
    if args.control != DEFAULT_CONTROL:
        cli_overrides["control_channel_file"] = args.control
    if args.insight_interval != DEFAULT_INSIGHT_INTERVAL:
        cli_overrides["insight_interval_seconds"] = args.insight_interval
    if args.simulation_tick != DEFAULT_SIMULATION_TICK:
        cli_overrides["simulation_tick_seconds"] = args.simulation_tick
    if args.simulation_hours != DEFAULT_SIMULATION_HOURS:
        cli_overrides["simulation_hours_per_tick"] = args.simulation_hours
    if args.simulation_energy_scale != DEFAULT_SIMULATION_ENERGY_SCALE:
        cli_overrides["simulation_energy_scale"] = args.simulation_energy_scale
    if args.simulation_compute_scale != DEFAULT_SIMULATION_COMPUTE_SCALE:
        cli_overrides["simulation_compute_scale"] = args.simulation_compute_scale
    if args.heartbeat_interval != DEFAULT_HEARTBEAT_INTERVAL:
        cli_overrides["heartbeat_interval_seconds"] = args.heartbeat_interval
    if args.heartbeat_timeout != DEFAULT_HEARTBEAT_TIMEOUT:
        cli_overrides["heartbeat_timeout_seconds"] = args.heartbeat_timeout
    if args.health_check_interval != DEFAULT_HEALTH_CHECK_INTERVAL:
        cli_overrides["health_check_interval_seconds"] = args.health_check_interval
    if args.integrity_interval != DEFAULT_INTEGRITY_INTERVAL:
        cli_overrides["integrity_check_interval_seconds"] = args.integrity_interval
    if args.audit_log is not None:
        cli_overrides["audit_log_path"] = args.audit_log
    if args.status_output is not None:
        cli_overrides["status_output_path"] = args.status_output
    if args.energy_oracle is not None:
        cli_overrides["energy_oracle_path"] = args.energy_oracle
    if args.energy_oracle_interval != DEFAULT_ENERGY_ORACLE_INTERVAL:
        cli_overrides["energy_oracle_interval_seconds"] = args.energy_oracle_interval
    if args.auto_policy_actions != DEFAULT_AUTO_POLICY_ACTIONS:
        cli_overrides["auto_policy_actions"] = args.auto_policy_actions
    if args.policy_action_interval != DEFAULT_POLICY_ACTION_INTERVAL:
        cli_overrides["policy_action_interval_seconds"] = args.policy_action_interval
    params.update(cli_overrides)

    max_cycles = params.get("max_cycles")
    if max_cycles is not None:
        _require_positive(max_cycles, field="cycles", allow_zero=True)
    _require_positive(params["insight_interval_seconds"], field="insight_interval_seconds")
    _require_positive(params["simulation_tick_seconds"], field="simulation_tick_seconds")
    _require_positive(params["simulation_hours_per_tick"], field="simulation_hours_per_tick")
    _require_positive(params["simulation_energy_scale"], field="simulation_energy_scale")
    _require_positive(params["simulation_compute_scale"], field="simulation_compute_scale")
    _require_positive(params["heartbeat_interval_seconds"], field="heartbeat_interval_seconds")
    _require_positive(params["heartbeat_timeout_seconds"], field="heartbeat_timeout_seconds")
    _require_positive(params["health_check_interval_seconds"], field="health_check_interval_seconds")
    _require_positive(params["integrity_check_interval_seconds"], field="integrity_check_interval_seconds")
    _require_positive(params["energy_oracle_interval_seconds"], field="energy_oracle_interval_seconds")
    _require_positive(params["policy_action_interval_seconds"], field="policy_action_interval_seconds")
    checkpoint_interval = float(
        params.get("checkpoint_interval_seconds", OrchestratorConfig.checkpoint_interval_seconds)
    )
    _require_positive(checkpoint_interval, field="checkpoint_interval_seconds")
    cycle_sleep = float(params.get("cycle_sleep_seconds", OrchestratorConfig.cycle_sleep_seconds))
    _require_positive(cycle_sleep, field="cycle_sleep_seconds")
    params["checkpoint_interval_seconds"] = checkpoint_interval
    params["cycle_sleep_seconds"] = cycle_sleep

    return OrchestratorConfig(**params)


async def _run_async(args: argparse.Namespace) -> None:
    overrides: dict[str, Any] = {}
    config = build_config(args, overrides)
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
