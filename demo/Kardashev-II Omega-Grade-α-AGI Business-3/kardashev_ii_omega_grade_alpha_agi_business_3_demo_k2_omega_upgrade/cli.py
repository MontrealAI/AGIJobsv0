"""Command line entry point for the Kardashev-II Omega-Grade Upgrade demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .jobs import JobSpec
from .orchestrator import Orchestrator, OrchestratorConfig


@dataclass(slots=True)
class MissionPlan:
    jobs: List[Dict[str, Any]]


def build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Launch the Kardashev-II Omega-Grade Upgrade for α-AGI Business 3 demo. "
            "Non-technical operators can configure, plan and run planetary missions with a single command."
        )
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent / "config" / "omega_k2_mission.json",
        help="Path to the mission configuration JSON file.",
    )
    parser.add_argument("--duration", type=float, default=0.0, help="Optional duration in seconds to run before graceful exit.")

    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("plan", help="Render a mermaid plan and textual summary without launching agents.")
    subparsers.add_parser("status", help="Print the latest structured status snapshot from disk.")
    subparsers.add_parser("ci", help="Validate configuration for CI pipelines.")

    inject_parser = subparsers.add_parser("inject-sim", help="Send an action to the attached planetary simulation.")
    inject_parser.add_argument("--action", required=True, help="JSON encoded action payload (e.g. '{\"build_solar\": 10}')")

    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = build_cli()
    args = parser.parse_args(list(argv) if argv is not None else None)

    config_path = args.config.resolve()
    if not config_path.exists():
        raise SystemExit(f"Configuration file not found: {config_path}")

    config_payload = json.loads(config_path.read_text(encoding="utf-8"))
    config = _build_config(config_payload, config_path=config_path)

    if args.command == "plan":
        mission_plan = MissionPlan(config_payload.get("initial_jobs", []))
        _render_plan(mission_plan, output_dir=config_path.parent)
        _print_summary(config_payload)
        return
    if args.command == "status":
        _print_status(config.status_output_path)
        return
    if args.command == "ci":
        _render_plan(MissionPlan(config_payload.get("initial_jobs", [])), output_dir=config_path.parent)
        _print_summary(config_payload)
        print("Configuration ready for CI execution.")
        return
    if args.command == "inject-sim":
        asyncio.run(_inject_sim_action(config, action=args.action))
        return

    asyncio.run(_run_demo(config, config_payload, duration=args.duration))


def _build_config(payload: Dict[str, Any], *, config_path: Path) -> OrchestratorConfig:
    package_root = config_path.parent.parent
    checkpoint_dir = Path(payload.get("checkpoint_dir") or package_root / "storage" / "checkpoints")
    status_path = Path(payload.get("status_output_path") or package_root / "storage" / "status.jsonl")
    return OrchestratorConfig(
        mission_name=payload["mission_name"],
        operator_account=payload["operator_account"],
        base_agent_tokens=float(payload.get("base_agent_tokens", 1e6)),
        energy_capacity=float(payload.get("energy_capacity", 1e9)),
        compute_capacity=float(payload.get("compute_capacity", 1e9)),
        validator_names=list(payload.get("validators", [])),
        worker_definitions=list(payload.get("workers", [])),
        checkpoint_dir=checkpoint_dir,
        status_output_path=status_path,
        governance_params=dict(payload.get("governance", {})),
        simulation_params=dict(payload.get("simulation", {})),
    )


def _render_plan(plan: MissionPlan, *, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    mermaid = _create_mermaid(plan.jobs)
    (output_dir / "mission-plan.mmd").write_text(mermaid, encoding="utf-8")


def _create_mermaid(job_defs: List[Dict[str, Any]]) -> str:
    lines = ["graph TD"]
    counter = 0

    def _render(node: Dict[str, Any], parent: Optional[str] = None) -> None:
        nonlocal counter
        node_id = f"J{counter}"
        counter += 1
        label = node.get("title", "Job")
        reward = node.get("reward_tokens", 0)
        skill = node.get("skill", "general")
        lines.append(f"    {node_id}[\"{label}\\nreward={reward}\\nskill={skill}\"]")
        if parent:
            lines.append(f"    {parent} --> {node_id}")
        for child in node.get("children", []):
            _render(child, node_id)

    for root in job_defs:
        _render(root)
    return "\n".join(lines)


def _print_summary(payload: Dict[str, Any]) -> None:
    print(f"Mission: {payload['mission_name']}")
    print(f"Operator: {payload['operator_account']}")
    print("Workers:")
    for worker in payload.get("workers", []):
        print(
            "  - {name} | skills={skills} | efficiency={efficiency}".format(
                name=worker.get("name"),
                skills=", ".join(worker.get("skills", [])),
                efficiency=worker.get("efficiency", 1.0),
            )
        )
    print("Validators:", ", ".join(payload.get("validators", [])))


def _print_status(status_path: Path) -> None:
    if not status_path.exists():
        print("No status snapshots found. Run the demo first.")
        return
    lines = status_path.read_text(encoding="utf-8").splitlines()
    if not lines:
        print("Status log empty.")
        return
    print(json.dumps(json.loads(lines[-1]), indent=2))


async def _run_demo(config: OrchestratorConfig, payload: Dict[str, Any], *, duration: float) -> None:
    orchestrator = Orchestrator(config)
    await orchestrator.start()
    try:
        for worker in payload.get("workers", []):
            balance = float(worker.get("starting_balance", 1e5))
            orchestrator.resource_manager.ensure_balance(worker["name"], balance)
        for validator in payload.get("validators", []):
            orchestrator.resource_manager.ensure_balance(validator, float(payload.get("validator_balance", 5e4)))
        await _launch_initial_jobs(orchestrator, payload.get("initial_jobs", []), employer=config.operator_account)
        if duration and duration > 0:
            await asyncio.sleep(duration)
            await orchestrator.shutdown()
        else:
            await asyncio.Event().wait()
    except KeyboardInterrupt:
        await orchestrator.shutdown()


async def _launch_initial_jobs(orchestrator: Orchestrator, jobs: List[Dict[str, Any]], *, employer: str, parent_id: Optional[str] = None) -> None:
    for job in jobs:
        spec = JobSpec(
            title=job["title"],
            description=job.get("description", job["title"]),
            reward_tokens=float(job.get("reward_tokens", 0.0)),
            stake_required=float(job.get("stake_required", 0.0)),
            energy_budget=float(job.get("energy_budget", 0.0)),
            compute_budget=float(job.get("compute_budget", 0.0)),
            deadline_s=float(job.get("deadline_s", 3600)),
            parent_id=parent_id,
            employer=job.get("employer", employer),
            skills=list(job.get("skills", [job.get("skill", "general")])),
            metadata={"skill": job.get("skill", "general"), **job.get("metadata", {})},
        )
        job_id = await orchestrator.create_job(spec)
        await _launch_initial_jobs(
            orchestrator,
            job.get("children", []),
            employer=spec.employer or employer,
            parent_id=job_id,
        )


async def _inject_sim_action(config: OrchestratorConfig, *, action: str) -> None:
    orchestrator = Orchestrator(config)
    await orchestrator.start()
    try:
        payload = json.loads(action)
        await orchestrator.inject_simulation_action(payload)
    finally:
        await orchestrator.shutdown()


if __name__ == "__main__":  # pragma: no cover
    main()

