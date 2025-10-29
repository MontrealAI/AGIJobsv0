"""Command line interface for the AGI Alpha Node demo."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

from .config import AlphaNodeConfig
from .node import AlphaNode


def load_node(config_path: Path) -> AlphaNode:
    config = AlphaNodeConfig.load(config_path)
    base_dir = config_path.parent
    return AlphaNode(config, base_path=base_dir)


def dump(payload: Any) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def cmd_bootstrap(node: AlphaNode, _args: argparse.Namespace) -> None:
    report = node.bootstrap()
    dump(asdict(report))


def cmd_activate(node: AlphaNode, args: argparse.Namespace) -> None:
    report = node.activate(auto_top_up=not args.no_top_up)
    dump(asdict(report))


def cmd_status(node: AlphaNode, _args: argparse.Namespace) -> None:
    dump(asdict(node.state_snapshot()))


def cmd_run(node: AlphaNode, _args: argparse.Namespace) -> None:
    report = node.run_once()
    if report is None:
        dump({"status": "no-jobs"})
        return
    payload = {
        "decisions": [asdict(item) for item in report.decisions],
        "specialists": {key: asdict(value) for key, value in report.specialist_outputs.items()},
        "compliance": asdict(node.last_compliance) if node.last_compliance else None,
    }
    dump(payload)


def cmd_autopilot(node: AlphaNode, args: argparse.Namespace) -> None:
    payload = node.autopilot(
        cycles=args.cycles,
        restake=not args.no_restake,
        safety_interval=args.safety_interval,
    )
    dump(payload)


def cmd_pause(node: AlphaNode, _args: argparse.Namespace) -> None:
    dump(asdict(node.pause("operator-request")))


def cmd_resume(node: AlphaNode, _args: argparse.Namespace) -> None:
    dump(asdict(node.resume("operator-request")))


def cmd_rotate_governance(node: AlphaNode, args: argparse.Namespace) -> None:
    dump(asdict(node.update_governance(args.address)))


def cmd_stake_deposit(node: AlphaNode, args: argparse.Namespace) -> None:
    dump(asdict(node.stake(args.amount)))


def cmd_stake_withdraw(node: AlphaNode, args: argparse.Namespace) -> None:
    dump(asdict(node.withdraw(args.amount)))


def cmd_compliance(node: AlphaNode, _args: argparse.Namespace) -> None:
    dump(asdict(node.compliance_report()))


def cmd_claim_rewards(node: AlphaNode, _args: argparse.Namespace) -> None:
    event = node.claim_rewards()
    if event is None:
        dump({"status": "threshold-not-met"})
    else:
        dump(asdict(event))


def cmd_update_stake_policy(node: AlphaNode, args: argparse.Namespace) -> None:
    payload = node.update_stake_policy(
        minimum_stake=args.minimum_stake,
        restake_threshold=args.restake_threshold,
    )
    dump(payload)


def cmd_safety_drill(node: AlphaNode, _args: argparse.Namespace) -> None:
    node.run_safety_drill()
    dump(asdict(node.state_snapshot()))


def cmd_metrics(node: AlphaNode, _args: argparse.Namespace) -> None:  # pragma: no cover - blocking call
    node.start_metrics()
    print(
        f"Metrics server running on {node.config.metrics.listen_host}:{node.config.metrics.listen_port}"
    )
    try:
        node.metrics.join()
    except KeyboardInterrupt:  # pragma: no cover - interactive command
        pass
    finally:
        node.shutdown()


def cmd_dashboard(node: AlphaNode, _args: argparse.Namespace) -> None:
    dump(node.dashboard_payload())


COMMANDS: dict[str, Callable[[AlphaNode, argparse.Namespace], None]] = {
    "bootstrap": cmd_bootstrap,
    "activate": cmd_activate,
    "status": cmd_status,
    "run": cmd_run,
    "autopilot": cmd_autopilot,
    "pause": cmd_pause,
    "resume": cmd_resume,
    "rotate-governance": cmd_rotate_governance,
    "stake-deposit": cmd_stake_deposit,
    "stake-withdraw": cmd_stake_withdraw,
    "compliance": cmd_compliance,
    "claim-rewards": cmd_claim_rewards,
    "update-stake-policy": cmd_update_stake_policy,
    "safety-drill": cmd_safety_drill,
    "metrics": cmd_metrics,
    "dashboard": cmd_dashboard,
}


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
    activate = sub.add_parser("activate")
    activate.add_argument("--no-top-up", action="store_true", help="Fail instead of auto-depositing stake")
    sub.add_parser("status")
    sub.add_parser("run")
    autopilot = sub.add_parser("autopilot")
    autopilot.add_argument("--cycles", type=int, default=3)
    autopilot.add_argument("--safety-interval", type=int, default=2)
    autopilot.add_argument("--no-restake", action="store_true")
    sub.add_parser("pause")
    sub.add_parser("resume")
    rotate = sub.add_parser("rotate-governance")
    rotate.add_argument("--address", required=True)
    stake = sub.add_parser("stake-deposit")
    stake.add_argument("--amount", type=float, required=True)
    withdraw = sub.add_parser("stake-withdraw")
    withdraw.add_argument("--amount", type=float, required=True)
    sub.add_parser("compliance")
    sub.add_parser("claim-rewards")
    update_policy = sub.add_parser("update-stake-policy")
    update_policy.add_argument("--minimum-stake", type=float)
    update_policy.add_argument("--restake-threshold", type=float)
    sub.add_parser("safety-drill")
    sub.add_parser("metrics")
    sub.add_parser("dashboard")
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    node = load_node(args.config)
    try:
        COMMANDS[args.command](node, args)
    except ValueError as exc:
        dump({"error": str(exc)})
        raise SystemExit(1) from exc
    finally:
        if args.command != "metrics":
            node.shutdown()


if __name__ == "__main__":  # pragma: no cover
    main()
