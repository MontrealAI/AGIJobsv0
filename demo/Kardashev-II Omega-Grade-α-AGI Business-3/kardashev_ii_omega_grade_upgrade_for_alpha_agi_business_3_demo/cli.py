"""Command line interface for the Omega-grade upgrade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Optional

from .config import OmegaOrchestratorConfig, load_config
from .orchestrator import OmegaUpgradeOrchestrator
from .owner import OwnerCommandStream

PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = PACKAGE_ROOT / "config" / "mission.json"
CI_CONFIG = PACKAGE_ROOT / "config" / "ci.json"


async def _run_orchestrator(config: OmegaOrchestratorConfig) -> None:
    orchestrator = OmegaUpgradeOrchestrator(config)
    await orchestrator.start()
    try:
        await orchestrator.wait_until_stopped()
    except KeyboardInterrupt:  # pragma: no cover - interactive guard
        await orchestrator.shutdown()


def _load_config(path: Optional[Path], overrides: Optional[Dict[str, Any]] = None) -> OmegaOrchestratorConfig:
    config_path = path or DEFAULT_CONFIG
    return load_config(config_path, overrides)


def _owner_stream(config: OmegaOrchestratorConfig) -> OwnerCommandStream:
    return OwnerCommandStream(
        config.control_channel_file,
        config.owner_command_ack_path,
    )


def _command_launch(args: argparse.Namespace) -> None:
    overrides: Dict[str, Any] = {}
    if args.cycles is not None:
        overrides["max_cycles"] = int(args.cycles)
    if args.no_resume:
        overrides["resume_from_checkpoint"] = False
    if args.mission_hours is not None:
        overrides["mission_target_hours"] = float(args.mission_hours)
    if args.integrity_interval is not None:
        overrides["integrity_check_interval_seconds"] = float(args.integrity_interval)
    if args.status_path is not None:
        overrides["status_output_path"] = str(args.status_path)
    config = _load_config(args.config, overrides)
    asyncio.run(_run_orchestrator(config))


def _command_owner(args: argparse.Namespace) -> None:
    config = _load_config(args.config)
    stream = _owner_stream(config)
    if args.subcommand == "pause":
        stream.send({"action": "pause"})
    elif args.subcommand == "resume":
        stream.send({"action": "resume"})
    elif args.subcommand == "stop":
        stream.send({"action": "stop"})
    elif args.subcommand == "governance":
        payload: Dict[str, Any] = {"action": "update_parameters", "governance": {}}
        if args.worker_stake_ratio is not None:
            payload["governance"]["worker_stake_ratio"] = float(args.worker_stake_ratio)
        if args.validator_stake is not None:
            payload["governance"]["validator_stake"] = float(args.validator_stake)
        if args.approvals_required is not None:
            payload["governance"]["approvals_required"] = int(args.approvals_required)
        if args.slash_ratio is not None:
            payload["governance"]["slash_ratio"] = float(args.slash_ratio)
        if args.pause_enabled is not None:
            payload["governance"]["pause_enabled"] = bool(args.pause_enabled)
        if args.commit_window is not None:
            payload["governance"]["validator_commit_window"] = float(args.commit_window)
        if args.reveal_window is not None:
            payload["governance"]["validator_reveal_window"] = float(args.reveal_window)
        stream.send(payload)
    elif args.subcommand == "resources":
        payload = {"action": "update_parameters", "resources": {}}
        for key in ("energy_capacity", "compute_capacity", "energy_available", "compute_available"):
            value = getattr(args, key)
            if value is not None:
                payload["resources"][key] = float(value)
        stream.send(payload)
    elif args.subcommand == "account":
        payload = {"action": "set_account", "account": args.account}
        for field in ("tokens", "locked", "energy_quota", "compute_quota"):
            value = getattr(args, field)
            if value is not None:
                payload[field] = float(value)
        stream.send(payload)
    elif args.subcommand == "cancel":
        payload = {"action": "cancel_job", "job_id": args.job_id, "reason": args.reason}
        stream.send(payload)
    else:
        raise SystemExit(f"Unknown owner subcommand: {args.subcommand}")
    print(f"Command queued -> {config.control_channel_file}")
    print(f"Await acknowledgement -> {config.owner_command_ack_path}")


def _command_status(args: argparse.Namespace) -> None:
    config = _load_config(args.config)
    dashboard_path = config.status_dashboard_path
    supervisor_path = config.supervisor_summary_path
    if dashboard_path.exists():
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
    else:
        dashboard = {"summary": {}, "latest_event": None}
    if supervisor_path.exists():
        supervisor = json.loads(supervisor_path.read_text(encoding="utf-8"))
    else:
        supervisor = {}
    print("=== Mission Summary ===")
    print(json.dumps(dashboard.get("summary", {}), indent=2))
    print("=== Latest Event ===")
    print(json.dumps(dashboard.get("latest_event"), indent=2))
    print("=== Long-Run Supervisor ===")
    print(json.dumps(supervisor, indent=2))


def _command_ci(_: argparse.Namespace) -> None:
    base_path = CI_CONFIG if CI_CONFIG.exists() else DEFAULT_CONFIG
    overrides = {"max_cycles": 8, "resume_from_checkpoint": False}
    config = _load_config(base_path, overrides)
    asyncio.run(_run_orchestrator(config))


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Operate the Kardashev-II Omega-Grade Upgrade demo",
    )
    parser.set_defaults(func=lambda _: parser.print_help())
    subparsers = parser.add_subparsers(dest="command")

    launch_parser = subparsers.add_parser("launch", help="Start the orchestrator loop")
    launch_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    launch_parser.add_argument("--cycles", type=int, default=None, help="Maximum cycles before graceful shutdown")
    launch_parser.add_argument("--mission-hours", type=float, default=None, help="Target mission duration in hours")
    launch_parser.add_argument("--integrity-interval", type=float, default=None, help="Integrity check interval override")
    launch_parser.add_argument("--no-resume", action="store_true", help="Ignore previous checkpoints")
    launch_parser.add_argument("--status-path", type=Path, default=None, help="Custom status stream path")
    launch_parser.set_defaults(func=_command_launch)

    owner_parser = subparsers.add_parser("owner", help="Issue operator commands")
    owner_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    owner_sub = owner_parser.add_subparsers(dest="subcommand", required=True)
    owner_parser.set_defaults(func=_command_owner)

    owner_sub.add_parser("pause", help="Pause orchestrator activity")
    owner_sub.add_parser("resume", help="Resume orchestrator activity")
    owner_sub.add_parser("stop", help="Shut down orchestrator")

    gov_parser = owner_sub.add_parser("governance", help="Tune governance parameters")
    gov_parser.add_argument("--worker-stake-ratio", type=float, default=None)
    gov_parser.add_argument("--validator-stake", type=float, default=None)
    gov_parser.add_argument("--approvals-required", type=int, default=None)
    gov_parser.add_argument("--slash-ratio", type=float, default=None)
    gov_parser.add_argument("--pause-enabled", type=int, choices=[0, 1], default=None)
    gov_parser.add_argument("--commit-window", type=float, default=None, help="Validator commit window (seconds)")
    gov_parser.add_argument("--reveal-window", type=float, default=None, help="Validator reveal window (seconds)")

    res_parser = owner_sub.add_parser("resources", help="Adjust resource capacities")
    for option in ("energy_capacity", "compute_capacity", "energy_available", "compute_available"):
        res_parser.add_argument(f"--{option.replace('_', '-')}", dest=option, type=float, default=None)

    account_parser = owner_sub.add_parser("account", help="Manage agent accounts")
    account_parser.add_argument("account", help="Account identifier to adjust")
    for option in ("tokens", "locked", "energy_quota", "compute_quota"):
        account_parser.add_argument(f"--{option.replace('_', '-')}", dest=option, type=float, default=None)

    cancel_parser = owner_sub.add_parser("cancel", help="Cancel a job by identifier")
    cancel_parser.add_argument("job_id", help="Job identifier to cancel")
    cancel_parser.add_argument("--reason", default="Operator requested cancellation")

    status_parser = subparsers.add_parser("status", help="Render the mission dashboard")
    status_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    status_parser.set_defaults(func=_command_status)

    ci_parser = subparsers.add_parser("ci", help="Minimal orchestration for CI smoke tests")
    ci_parser.set_defaults(func=_command_ci)

    args = parser.parse_args(argv)
    args.func(args)
