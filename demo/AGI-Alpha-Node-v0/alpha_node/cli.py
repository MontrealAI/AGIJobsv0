"""Command-line interface for non-technical operators."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

from .config import AlphaNodeConfig, load_config
from .logging_utils import get_logger
from .node import AlphaNode

LOGGER = get_logger(__name__)


def _load_node(config_path: Path, ens_cache: Path | None) -> AlphaNode:
    config = load_config(config_path)
    return AlphaNode(config=config, ens_cache=ens_cache)


def bootstrap_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    print("Alpha Node bootstrapped. Compliance score: %.2f" % node.state.ops.compliance_score)


def run_once_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    result = node.run_once()
    if result:
        print(json.dumps(result.__dict__, indent=2))
    else:
        print("No jobs executed")


def stake_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    status = node.stake(int(args.amount))
    print(json.dumps(status.__dict__, indent=2))


def withdraw_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    status = node.withdraw(int(args.amount))
    print(json.dumps(status.__dict__, indent=2))


def claim_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    snapshot = node.claim_rewards()
    print(json.dumps(snapshot.__dict__, indent=2))


def pause_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.pause()
    print("System paused")


def resume_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.resume()
    print("System resumed")


def status_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    snapshot = node.state.snapshot()
    print(json.dumps(snapshot, indent=2))


def governance_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.update_governance(args.address)
    print(f"Governance address updated to {args.address}")


def compliance_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    score = node.compliance_report()
    if args.format == "json":
        print(json.dumps({"composite": score.composite, "dimensions": score.dimensions}, indent=2))
    else:
        print("Composite Compliance Score: %.2f" % score.composite)
        for dimension, value in score.dimensions.items():
            print(f"- {dimension}: {value:.2f}")


def drill_command(args: argparse.Namespace) -> None:
    node = _load_node(Path(args.config), Path(args.ens_cache) if args.ens_cache else None)
    node.bootstrap()
    node.run_safety_drill()
    print("Emergency drill executed and recorded")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operate the AGI Alpha Node demo")
    parser.add_argument("--config", required=True, help="Path to configuration YAML")
    parser.add_argument("--ens-cache", help="Optional ENS cache JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("bootstrap", help="Validate configuration and ENS domain")
    subparsers.add_parser("run-once", help="Execute a single job loop")
    subparsers.add_parser("pause", help="Pause the node")
    subparsers.add_parser("resume", help="Resume the node")
    subparsers.add_parser("status", help="Show current state snapshot")
    stake_parser = subparsers.add_parser("stake", help="Increase operator stake")
    stake_parser.add_argument("--amount", required=True, help="Stake amount in wei")
    withdraw_parser = subparsers.add_parser("withdraw", help="Withdraw operator stake")
    withdraw_parser.add_argument("--amount", required=True, help="Withdrawal amount in wei")
    subparsers.add_parser("claim-rewards", help="Claim accumulated rewards")
    governance_parser = subparsers.add_parser("set-governance", help="Rotate governance address")
    governance_parser.add_argument("--address", required=True, help="New governance address")
    compliance_parser = subparsers.add_parser("compliance", help="Show compliance scorecard")
    compliance_parser.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Output format",
    )
    subparsers.add_parser("drill", help="Run antifragility safety drill")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    command = args.command
    if command == "bootstrap":
        bootstrap_command(args)
    elif command == "run-once":
        run_once_command(args)
    elif command == "pause":
        pause_command(args)
    elif command == "resume":
        resume_command(args)
    elif command == "status":
        status_command(args)
    elif command == "stake":
        stake_command(args)
    elif command == "withdraw":
        withdraw_command(args)
    elif command == "claim-rewards":
        claim_command(args)
    elif command == "set-governance":
        governance_command(args)
    elif command == "compliance":
        compliance_command(args)
    elif command == "drill":
        drill_command(args)
    else:
        parser.error(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
