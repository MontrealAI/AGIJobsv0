"""Command line interface for the ultra-grade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Optional

from kardashev_ii_omega_grade_upgrade_for_alpha_agi_business_3_demo.owner import (
    OwnerCommandStream,
)

from .config import UltraDemoConfig, UltraConfigError, load_ultra_config
from .orchestrator import UltraOrchestrator

_DEFAULT_CONFIG = (
    Path(__file__).resolve().parent / "config" / "mission.json"
).resolve()


def _build_launch_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    launch = subparsers.add_parser(
        "launch",
        help="Launch the ultra-grade orchestrator with the provided mission plan",
    )
    launch.add_argument("--config", type=Path, default=_DEFAULT_CONFIG)
    launch.add_argument(
        "--cycles",
        type=int,
        default=0,
        help="Optional cycle limit for the orchestrator (0 = governed by mission)",
    )
    launch.add_argument(
        "--runtime-hours",
        type=float,
        help="Override mission runtime horizon (hours)",
    )
    launch.add_argument(
        "--no-sim",
        action="store_true",
        help="Disable the embedded planetary simulation",
    )
    launch.add_argument(
        "--checkpoint",
        type=Path,
        help="Optional override for checkpoint location",
    )


def _build_owner_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    owner = subparsers.add_parser("owner", help="Issue owner-grade control commands")
    owner.add_argument("action", choices=["pause", "resume", "governance", "resources", "cancel"])
    owner.add_argument("--config", type=Path, default=_DEFAULT_CONFIG)
    owner.add_argument("--job-id", type=str, help="Target job identifier for cancellation")
    owner.add_argument(
        "--payload",
        type=Path,
        help="JSON file describing parameter updates for governance/resources",
    )


def _build_ci_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    ci = subparsers.add_parser("ci", help="Execute a fast deterministic CI mission run")
    ci.add_argument("--config", type=Path, default=_DEFAULT_CONFIG)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Kardashev-II Omega-Grade Ultra Mission orchestrator",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    _build_launch_parser(subparsers)
    _build_owner_parser(subparsers)
    _build_ci_parser(subparsers)
    return parser


async def _run_orchestrator(config: UltraDemoConfig) -> None:
    orchestrator = UltraOrchestrator(config)
    try:
        await orchestrator.start()
        await orchestrator.wait_until_stopped()
    finally:
        await orchestrator.shutdown()


def _apply_launch_overrides(config: UltraDemoConfig, args: argparse.Namespace) -> UltraDemoConfig:
    if args.cycles:
        config.orchestrator.max_cycles = int(args.cycles)
    if args.runtime_hours is not None:
        config.mission.runtime_hours = float(args.runtime_hours)
    if args.no_sim:
        config.orchestrator.enable_simulation = False
    if args.checkpoint:
        config.orchestrator.checkpoint_path = args.checkpoint
    return config


def _load_payload(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise UltraConfigError("Owner payload must be a JSON object")
    return data


def _dispatch_owner_command(args: argparse.Namespace) -> None:
    config = load_ultra_config(args.config)
    stream = OwnerCommandStream(
        config.orchestrator.control_channel_file,
        config.orchestrator.owner_command_ack_path,
    )
    payload: Dict[str, Any]
    if args.action in {"governance", "resources"}:
        if not args.payload:
            raise UltraConfigError("--payload is required for governance/resources updates")
        payload = _load_payload(args.payload)
        payload.setdefault("type", args.action)
    elif args.action == "cancel":
        if not args.job_id:
            raise UltraConfigError("--job-id is required for cancellation")
        payload = {"type": "cancel", "job_id": args.job_id}
    else:
        payload = {"type": args.action}
    stream.send(payload)


async def _run_ci(args: argparse.Namespace) -> None:
    config = load_ultra_config(args.config)
    config.orchestrator.max_cycles = 3
    config.orchestrator.cycle_sleep_seconds = 0.01
    config.orchestrator.insight_interval_seconds = 0.05
    config.mission.runtime_hours = 0.001
    config.mission.archive_interval_seconds = 0.1
    await _run_orchestrator(config)


async def _run_launch(args: argparse.Namespace) -> None:
    config = load_ultra_config(args.config)
    config = _apply_launch_overrides(config, args)
    await _run_orchestrator(config)


def main(argv: Optional[list[str]] = None) -> None:
    args = build_parser().parse_args(argv)
    if args.command == "owner":
        _dispatch_owner_command(args)
        return
    try:
        if args.command == "ci":
            asyncio.run(_run_ci(args))
        elif args.command == "launch":
            asyncio.run(_run_launch(args))
    except UltraConfigError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
