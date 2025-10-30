"""Command line interface for the AGI Alpha Node demo."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .compliance import ComplianceEngine
from .config import AlphaNodeConfig
from .ens import ENSVerifier
from .governance import GovernanceController
from .jobs import JobRegistry, TaskHarvester
from .knowledge import KnowledgeLake
from .metrics import MetricsServer
from .orchestrator import AlphaOrchestrator, build_specialists
from .planner import MuZeroPlanner
from .safety import SafetyController
from .stake import StakeManager
from .state import StateStore


def load_environment(config_path: Path) -> dict[str, Any]:
    config = AlphaNodeConfig.load(config_path)
    base_dir = config_path.parent
    state_store = StateStore(base_dir / "state.json")
    ledger_path = base_dir / "stake_ledger.csv"
    stake_manager = StakeManager(config.stake, state_store, ledger_path)
    ens_registry = base_dir / "ens_registry.csv"
    ens_verifier = ENSVerifier(config.ens, ens_registry)
    governance = GovernanceController(config.governance, state_store)
    knowledge_path = (base_dir / config.knowledge.storage_path).resolve()
    knowledge = KnowledgeLake(knowledge_path, state_store)
    planner = MuZeroPlanner(config.planner)
    specialists = build_specialists(config.specialists)
    orchestrator = AlphaOrchestrator(
        planner=planner,
        knowledge=knowledge,
        specialists=specialists,
        store=state_store,
    )
    job_registry = JobRegistry((base_dir / config.jobs.job_source).resolve())
    harvester = TaskHarvester(job_registry, state_store)
    compliance = ComplianceEngine(config.compliance, state_store, stake_manager)
    safety = SafetyController(state_store, stake_manager, ens_verifier, governance)
    return {
        "config": config,
        "state_store": state_store,
        "stake_manager": stake_manager,
        "ens_verifier": ens_verifier,
        "governance": governance,
        "knowledge": knowledge,
        "orchestrator": orchestrator,
        "harvester": harvester,
        "compliance": compliance,
        "safety": safety,
    }


def cmd_bootstrap(env: dict[str, Any]) -> None:
    stake_manager: StakeManager = env["stake_manager"]
    stake_manager.deposit(env["config"].stake.minimum_stake)
    safety_eval = env["safety"].guard("bootstrap", auto_resume=False)
    ens_result = env["ens_verifier"].verify()
    report = env["compliance"].evaluate(ens_result)
    print(
        json.dumps(
            {
                "compliance": asdict(report),
                "safety": asdict(safety_eval),
            },
            indent=2,
        )
    )


def cmd_status(env: dict[str, Any]) -> None:
    state = env["state_store"].read()
    print(json.dumps(asdict(state), indent=2))


def cmd_run(env: dict[str, Any]) -> None:
    safety_eval = env["safety"].guard("run-cycle")
    if not safety_eval.safe:
        state = env["state_store"].read()
        print(
            json.dumps(
                {
                    "status": "paused",
                    "pause_reason": state.pause_reason,
                    "safety": asdict(safety_eval),
                },
                indent=2,
            )
        )
        return

    jobs = list(env["harvester"].harvest())
    if not jobs:
        compliance_report = env["compliance"].evaluate(env["ens_verifier"].verify())
        print(
            json.dumps(
                {
                    "status": "idle",
                    "compliance": compliance_report.overall,
                    "safety": asdict(safety_eval),
                },
                indent=2,
            )
        )
        return

    report = env["orchestrator"].run(jobs)
    env["stake_manager"].accrue_rewards(
        sum(result.projected_reward for result in report.specialist_outputs.values()) * 0.05
    )
    ens_result = env["ens_verifier"].verify()
    compliance_report = env["compliance"].evaluate(ens_result)
    payload = {
        "decisions": [asdict(decision) for decision in report.decisions],
        "specialists": {k: asdict(v) for k, v in report.specialist_outputs.items()},
        "compliance": compliance_report.overall,
        "safety": asdict(safety_eval),
    }
    print(json.dumps(payload, indent=2))


def cmd_pause(env: dict[str, Any]) -> None:
    status = env["governance"].pause_all("operator-request")
    print(json.dumps(asdict(status), indent=2))


def cmd_resume(env: dict[str, Any]) -> None:
    status = env["governance"].resume_all("operator-resume")
    print(json.dumps(asdict(status), indent=2))


def cmd_stake_deposit(env: dict[str, Any], amount: float) -> None:
    event = env["stake_manager"].deposit(amount)
    print(json.dumps(asdict(event), indent=2))


def cmd_compliance(env: dict[str, Any]) -> None:
    report = env["compliance"].evaluate(env["ens_verifier"].verify())
    print(json.dumps(
        {
            "overall": report.overall,
            "dimensions": {k: asdict(v) for k, v in report.dimensions.items()},
        },
        indent=2,
    ))


def cmd_safety(env: dict[str, Any]) -> None:
    evaluation = env["safety"].evaluate()
    print(json.dumps(asdict(evaluation), indent=2))


def cmd_metrics(env: dict[str, Any]) -> None:  # pragma: no cover - server loop
    server = MetricsServer(
        env["config"].metrics.listen_host,
        env["config"].metrics.listen_port,
        env["state_store"],
    )
    print(
        f"Starting metrics server on {env['config'].metrics.listen_host}:{env['config'].metrics.listen_port}"
    )
    server.start()
    server.join()


def cmd_dashboard(env: dict[str, Any]) -> None:
    state = env["state_store"].read()
    ens_result = env["ens_verifier"].verify()
    report = env["compliance"].evaluate(ens_result)
    payload = {
        "state": asdict(state),
        "compliance": {
            "overall": report.overall,
            "dimensions": {k: asdict(v) for k, v in report.dimensions.items()},
        },
        "safety": asdict(env["safety"].evaluate()),
    }
    print(json.dumps(payload, indent=2))


def cmd_rotate_governance(env: dict[str, Any], address: str) -> None:
    status = env["governance"].rotate_governance(address)
    print(json.dumps(asdict(status), indent=2))


def cmd_drill(env: dict[str, Any]) -> None:
    evaluation = env["safety"].conduct_drill()
    compliance = env["compliance"].evaluate(env["ens_verifier"].verify())
    print(
        json.dumps(
            {
                "safety": asdict(evaluation),
                "compliance": asdict(compliance),
            },
            indent=2,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AGI Alpha Node Demo Controller")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "config.toml",
        help="Path to configuration file",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("bootstrap")
    sub.add_parser("status")
    sub.add_parser("run")
    sub.add_parser("pause")
    sub.add_parser("resume")
    sub.add_parser("compliance")
    sub.add_parser("metrics")
    sub.add_parser("dashboard")
    sub.add_parser("safety")
    sub.add_parser("drill")
    rotate = sub.add_parser("rotate-governance")
    rotate.add_argument("--address", required=True)
    stake = sub.add_parser("stake-deposit")
    stake.add_argument("--amount", type=float, required=True)
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    env = load_environment(args.config)
    command_map = {
        "bootstrap": cmd_bootstrap,
        "status": cmd_status,
        "run": cmd_run,
        "pause": cmd_pause,
        "resume": cmd_resume,
        "compliance": cmd_compliance,
        "safety": cmd_safety,
        "metrics": cmd_metrics,
        "dashboard": cmd_dashboard,
        "rotate-governance": lambda env: cmd_rotate_governance(env, args.address),
        "stake-deposit": lambda env: cmd_stake_deposit(env, args.amount),
        "drill": cmd_drill,
    }
    command_map[args.command](env)


if __name__ == "__main__":  # pragma: no cover
    main()
