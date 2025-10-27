"""Command line interface for the Kardashev-II Omega-Grade Upgrade K2 demo."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

from .config import MissionPlan
from .control_panel import OperatorControlPanel

DEFAULT_CONFIG = (
    Path(__file__).resolve().parent / "config" / "mission.json"
)


def _parse_key_value_pairs(pairs: Iterable[str]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for item in pairs:
        if "=" not in item:
            raise ValueError(f"Expected key=value format, received: {item}")
        key, raw_value = item.split("=", 1)
        key = key.strip()
        value: Any
        if raw_value.lower() in {"true", "false"}:
            value = raw_value.lower() == "true"
        else:
            try:
                if "." in raw_value:
                    value = float(raw_value)
                else:
                    value = int(raw_value)
            except ValueError:
                value = raw_value
        result[key] = value
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kardashev-II Omega-Grade Upgrade (K2) Demo")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help="Path to the mission configuration JSON file",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    launch = subparsers.add_parser("launch", help="Run the full autonomous mission")
    launch.add_argument("--cycles", type=int, default=0, help="Optional maximum cycles before graceful shutdown")
    launch.add_argument(
        "--duration-minutes",
        type=float,
        help="Optional duration (in minutes) before the orchestrator is paused and checkpointed",
    )
    launch.add_argument(
        "--run-dir",
        type=Path,
        help="Directory where checkpoints, control channel, and status outputs should be written",
    )
    launch.add_argument(
        "--fast",
        action="store_true",
        help="Use faster cycle timings for interactive exploration",
    )

    ci = subparsers.add_parser("ci", help="Run the deterministic CI smoke test")
    ci.add_argument(
        "--cycles",
        type=int,
        default=6,
        help="Number of orchestrator cycles for the smoke test",
    )

    status = subparsers.add_parser("status", help="Show the latest orchestrator status snapshot")
    status.add_argument("--limit", type=int, default=3, help="Number of entries to display")
    status.add_argument(
        "--run-dir",
        type=Path,
        help="Directory where orchestrator outputs (status, control channel) are stored",
    )

    mermaid = subparsers.add_parser("mermaid", help="Render the mission job graph as Mermaid syntax")
    mermaid.add_argument(
        "--output",
        type=Path,
        help="Optional output path for the generated mermaid diagram",
    )

    control = subparsers.add_parser("control", help="Send an operator command to the orchestrator")
    action_group = control.add_mutually_exclusive_group(required=False)
    action_group.add_argument("--pause", action="store_true", help="Pause the orchestrator")
    action_group.add_argument("--resume", action="store_true", help="Resume the orchestrator")
    action_group.add_argument("--stop", action="store_true", help="Stop the orchestrator")
    control.add_argument("--set-operator", type=str, help="Assign a new operator account identifier")
    control.add_argument("--cancel-job", type=str, help="Cancel the given job id")
    control.add_argument("--reason", type=str, help="Optional cancellation reason")
    control.add_argument(
        "--governance",
        nargs="*",
        default=[],
        help="Governance overrides expressed as key=value pairs (e.g. approvals_required=3)",
    )
    control.add_argument(
        "--resources",
        nargs="*",
        default=[],
        help="Resource adjustments expressed as key=value pairs",
    )
    control.add_argument(
        "--run-dir",
        type=Path,
        help="Directory where orchestrator outputs (status, control channel) are stored",
    )

    return parser


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


async def _run_orchestrator(
    plan: MissionPlan,
    *,
    cycles: Optional[int] = None,
    run_dir: Optional[Path] = None,
    duration_minutes: Optional[float] = None,
    fast: bool = False,
) -> None:
    overrides: Dict[str, Any] = {}
    if plan.autopilot.enabled:
        overrides.setdefault(
            "checkpoint_interval_seconds",
            plan.autopilot.checkpoint_interval_seconds,
        )
    if cycles and cycles > 0:
        overrides["max_cycles"] = int(cycles)
    if fast:
        overrides["cycle_sleep_seconds"] = 0.05
        overrides["insight_interval_seconds"] = 1.0
        overrides["simulation_tick_seconds"] = 0.25
    orchestrator = plan.create_orchestrator(
        mission_name=plan.name,
        checkpoint_dir=run_dir,
        overrides=overrides,
    )
    await orchestrator.start()
    try:
        if duration_minutes and duration_minutes > 0:
            timeout = max(1.0, duration_minutes * 60.0)
            try:
                await asyncio.wait_for(orchestrator.wait_until_stopped(), timeout=timeout)
            except asyncio.TimeoutError:
                await orchestrator.shutdown()
        else:
            await orchestrator.wait_until_stopped()
    finally:
        await orchestrator.shutdown()


async def _run_ci(plan: MissionPlan, cycles: int) -> None:
    await _run_orchestrator(plan, cycles=cycles, run_dir=plan.control_channel.parent, fast=True)


def _load_plan(path: Path) -> MissionPlan:
    return MissionPlan.load(path)


def _resolve_panel(plan: MissionPlan, *, run_dir: Optional[Path] = None) -> OperatorControlPanel:
    if run_dir is None:
        control_path = plan.control_channel
        status_path = plan.status_output
    else:
        control_path = run_dir / plan.control_channel.name
        status_path = run_dir / plan.status_output.name
    return OperatorControlPanel.from_paths(control_path, status_path)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    plan = _load_plan(args.config)

    if args.command == "launch":
        duration = args.duration_minutes
        if duration is None and plan.autopilot.enabled and plan.autopilot.mission_hours:
            duration = float(plan.autopilot.mission_hours) * 60.0
        try:
            asyncio.run(
                _run_orchestrator(
                    plan,
                    cycles=args.cycles if args.cycles > 0 else None,
                    run_dir=args.run_dir,
                    duration_minutes=duration,
                    fast=args.fast,
                )
            )
        except KeyboardInterrupt:
            pass
    elif args.command == "ci":
        asyncio.run(_run_ci(plan, cycles=args.cycles))
    elif args.command == "status":
        panel = _resolve_panel(plan, run_dir=args.run_dir)
        snapshots = panel.recent_status(limit=args.limit)
        if not snapshots:
            print("No status snapshots available yet.")
        else:
            for entry in snapshots:
                print(entry)
    elif args.command == "mermaid":
        blueprint = plan.mermaid_blueprint()
        if args.output:
            args.output.write_text(blueprint, encoding="utf-8")
            print(f"Mermaid diagram written to {args.output}")
        else:
            print(blueprint)
    elif args.command == "control":
        panel = _resolve_panel(plan, run_dir=args.run_dir)
        dispatched = False
        if args.pause:
            panel.pause()
            dispatched = True
        elif args.resume:
            panel.resume()
            dispatched = True
        elif args.stop:
            panel.emergency_stop()
            dispatched = True
        if args.set_operator:
            panel.set_operator_account(args.set_operator)
            dispatched = True
        if args.cancel_job:
            panel.cancel_job(args.cancel_job, reason=args.reason)
            dispatched = True
        if args.governance:
            panel.update_governance(**_parse_key_value_pairs(args.governance))
            dispatched = True
        if args.resources:
            panel.adjust_resource_caps(**_parse_key_value_pairs(args.resources))
            dispatched = True
        if not dispatched:
            raise SystemExit("No control actions specified.")
    else:  # pragma: no cover - defensive guard
        raise RuntimeError(f"Unhandled command: {args.command}")


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
