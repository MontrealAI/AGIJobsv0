"""Operator console for the AGI Alpha Node demo."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
import argparse
import json
import logging
import sys
import textwrap

from .blockchain import BlockchainClient
from .compliance import ComplianceEngine
from .config import DemoConfig, load_config
from .knowledge import KnowledgeLake
from .metrics import MetricsRegistry, MetricsServer, hydrate_metrics
from .orchestrator import Orchestrator

LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
LOGGER = logging.getLogger("agi_alpha_node.console")


def _init_components(config: DemoConfig) -> Dict[str, Any]:
    blockchain = BlockchainClient(config.blockchain, config.minimum_stake)
    knowledge = KnowledgeLake(config.knowledge_path)
    orchestrator = Orchestrator(blockchain, knowledge)
    compliance = ComplianceEngine(config, blockchain)
    metrics_registry = MetricsRegistry()
    metrics_server = MetricsServer(config.metrics.host, config.metrics.port, metrics_registry)
    return {
        "config": config,
        "blockchain": blockchain,
        "knowledge": knowledge,
        "orchestrator": orchestrator,
        "compliance": compliance,
        "metrics_registry": metrics_registry,
        "metrics_server": metrics_server,
    }


def command_bootstrap(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    components = _init_components(config)

    LOGGER.info("Bootstrapping AGI Alpha Node")
    verified = components["blockchain"].verify_ens_control(config.ens_name, config.operator_address)
    if not verified:
        LOGGER.error("ENS verification failed; aborting startup")
        sys.exit(1)

    stake_status = components["blockchain"].get_stake_status(config.operator_address)
    if not stake_status.can_activate:
        LOGGER.error(
            "Stake below threshold",
            extra={"current": stake_status.current_stake, "minimum": stake_status.minimum_required},
        )
        sys.exit(2)

    components["metrics_server"].start()
    report = components["compliance"].evaluate()
    hydrate_metrics(components["metrics_registry"], report.total_score, 0, 0)

    LOGGER.info(
        "Bootstrap complete",
        extra={
            "compliance_score": report.total_score,
            "metrics_endpoint": f"http://{config.metrics.host}:{config.metrics.port}/metrics",
        },
    )


def command_launch_dashboard(args: argparse.Namespace) -> None:
    dashboard_path = Path(__file__).resolve().parent.parent / "web" / "dashboard.html"
    if not dashboard_path.exists():
        LOGGER.error("Dashboard not found", extra={"path": str(dashboard_path)})
        sys.exit(1)
    print(
        textwrap.dedent(
            f"""
            Dashboard ready.
            Open file://{dashboard_path} in your browser.
            Use the built-in simulator to visualize the node's status.
            """
        ).strip()
    )


def command_run_demo(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    components = _init_components(config)

    LOGGER.info("Running demo workflow")
    jobs = list(components["blockchain"].available_jobs())
    results = components["orchestrator"].evaluate_and_execute(jobs)
    rewards_claimed = components["blockchain"].claim_rewards(config.operator_address)
    report = components["compliance"].evaluate()
    hydrate_metrics(components["metrics_registry"], report.total_score, rewards_claimed, len(results))

    summary = {
        "jobs_completed": [result.__dict__ for result in results],
        "rewards_claimed": rewards_claimed,
        "compliance_score": report.total_score,
        "metrics_endpoint": f"http://{config.metrics.host}:{config.metrics.port}/metrics",
    }
    print(json.dumps(summary, indent=2))


def command_compliance(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    components = _init_components(config)
    report = components["compliance"].evaluate()
    print(json.dumps(report.to_dict(), indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AGI Alpha Node operator console")
    subparsers = parser.add_subparsers(dest="command")

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", default=None, help="Path to configuration file")

    bootstrap = subparsers.add_parser("bootstrap", parents=[common], help="Initialize the node")
    bootstrap.set_defaults(func=command_bootstrap)

    launch_dashboard = subparsers.add_parser(
        "launch-dashboard", parents=[common], help="Open the operator dashboard"
    )
    launch_dashboard.set_defaults(func=command_launch_dashboard)

    run_demo = subparsers.add_parser("run-demo", parents=[common], help="Execute the full demo workflow")
    run_demo.set_defaults(func=command_run_demo)

    compliance = subparsers.add_parser("compliance", parents=[common], help="Print the compliance scorecard")
    compliance.set_defaults(func=command_compliance)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return
    args.func(args)


app = build_parser


if __name__ == "__main__":
    main(sys.argv[1:])
