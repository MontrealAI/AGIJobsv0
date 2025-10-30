from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import List

if __package__ in {None, ""}:  # pragma: no cover - runtime entrypoint convenience
    import sys

    CURRENT_FILE = Path(__file__).resolve()
    sys.path.insert(0, str(CURRENT_FILE.parent.parent))

from agi_alpha_node_demo.blockchain.contracts import JobRegistryClient, MockLedger, StakeManagerClient, SystemPauseClient
from agi_alpha_node_demo.blockchain.ens import ENSVerifier
from agi_alpha_node_demo.compliance.scorecard import ComplianceEngine
from agi_alpha_node_demo.config import AppConfig, load_config
from agi_alpha_node_demo.knowledge.lake import KnowledgeLake
from agi_alpha_node_demo.logging_utils import configure_logging
from agi_alpha_node_demo.metrics.exporter import MetricRegistry, PrometheusServer
from agi_alpha_node_demo.orchestrator import Orchestrator
from agi_alpha_node_demo.planner.muzero import MuZeroPlanner
from agi_alpha_node_demo.safety.pause import DrillScheduler, PauseController
from agi_alpha_node_demo.tasks.router import TaskHarvester

logger = logging.getLogger(__name__)


def build_app(config_path: str) -> tuple[AppConfig, dict]:
    config = load_config(config_path)
    configure_logging(config.logging.log_dir, config.logging.log_level)
    ledger = MockLedger()
    stake_manager = StakeManagerClient(ledger)
    system_pause = SystemPauseClient(ledger)
    ens = ENSVerifier(config.network.rpc_url, config.network.chain_id)
    knowledge = KnowledgeLake(Path(config.logging.log_dir) / config.knowledge_lake.database)
    planner = MuZeroPlanner(config.planner.search_depth, config.planner.num_simulations, config.planner.exploration_constant)
    registry = JobRegistryClient()
    harvester = TaskHarvester(registry)
    orchestrator = Orchestrator(planner, knowledge, harvester)
    metrics = MetricRegistry()
    prometheus = PrometheusServer(metrics, config.metrics.port)
    compliance = ComplianceEngine(config, ens, stake_manager, system_pause)
    pause_controller = PauseController(system_pause)
    drill_scheduler = DrillScheduler(pause_controller, config.safety.automated_drills_interval_seconds)
    components = {
        "ledger": ledger,
        "stake_manager": stake_manager,
        "system_pause": system_pause,
        "ens": ens,
        "knowledge": knowledge,
        "planner": planner,
        "registry": registry,
        "harvester": harvester,
        "orchestrator": orchestrator,
        "metrics": metrics,
        "prometheus": prometheus,
        "compliance": compliance,
        "pause_controller": pause_controller,
        "drill_scheduler": drill_scheduler,
    }
    return config, components


def command_status(config: AppConfig, components: dict) -> None:
    report = components["compliance"].evaluate()
    print(json.dumps(report.to_dict(), indent=2))


def command_bootstrap(config: AppConfig, components: dict) -> None:
    stake_manager: StakeManagerClient = components["stake_manager"]
    ledger: MockLedger = components["ledger"]
    required = config.staking.required_stake
    if ledger.stakes.get(config.governance.owner_address, 0) < required:
        tx_hash = stake_manager.deposit(config.governance.owner_address, required)
        logger.info("Stake deposited", extra={"tx_hash": tx_hash})
    components["drill_scheduler"].start()
    components["prometheus"].start()
    logger.info("Bootstrap complete")


def command_run(config: AppConfig, components: dict, serve_dashboard: bool) -> None:
    orchestrator: Orchestrator = components["orchestrator"]
    metrics: MetricRegistry = components["metrics"]
    registry: JobRegistryClient = components["registry"]

    registry.register_job(
        "demo-job-1",
        {
            "domain": "finance",
            "capital": "1000000",
            "risk": "0.15",
            "reward": "120",
        },
    )
    registry.register_job(
        "demo-job-2",
        {
            "domain": "manufacturing",
            "throughput": "42",
            "waste": "0.03",
            "reward": "80",
        },
    )

    reports = orchestrator.run_cycle()
    total_reward = sum(report.total_reward for report in reports)
    metrics.set_metric("agi_alpha_node_total_reward", total_reward)
    metrics.set_metric("agi_alpha_node_jobs_completed", len(reports))
    metrics.set_metric("agi_alpha_node_compliance_score", components["compliance"].evaluate().overall_score)

    for report in reports:
        print(f"Executed job {report.job_id} using {report.planner.strategy} -> reward {report.total_reward:.2f}")

    if serve_dashboard:
        dashboard_path = Path(__file__).resolve().parent.parent / "web" / "index.html"
        print(f"Dashboard available at {dashboard_path}")


def command_pause(components: dict) -> None:
    components["pause_controller"].pause()
    logger.warning("System paused by operator")


def command_resume(components: dict) -> None:
    components["pause_controller"].resume()
    logger.info("System resumed by operator")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AGI Alpha Node Demo")
    parser.add_argument("--config", default="demo/AGI-Alpha-Node-v0/config/default.toml")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Show compliance status")
    sub.add_parser("bootstrap", help="Initialize staking, drills, and metrics")
    run_parser = sub.add_parser("run", help="Execute a full orchestration cycle")
    run_parser.add_argument("--serve-dashboard", action="store_true", help="Print dashboard path after execution")
    sub.add_parser("pause", help="Pause all operations")
    sub.add_parser("resume", help="Resume operations")
    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    config, components = build_app(args.config)

    command = args.command
    if command == "status":
        command_status(config, components)
    elif command == "bootstrap":
        command_bootstrap(config, components)
    elif command == "run":
        command_run(config, components, args.serve_dashboard)
    elif command == "pause":
        command_pause(components)
    elif command == "resume":
        command_resume(components)
    else:  # pragma: no cover - argparse prevents this
        parser.error(f"Unknown command {command}")


if __name__ == "__main__":
    main()
