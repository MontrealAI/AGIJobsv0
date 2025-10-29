"""Interactive launcher for the AGI Alpha Node demo."""
from __future__ import annotations

import argparse
import json
import textwrap
from dataclasses import asdict, is_dataclass
from pathlib import Path

from alpha_node.config import AlphaNodeConfig
from alpha_node.node import AlphaNode


def _prompt(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:  # pragma: no cover - defensive
        return ""


def _print_header(config_path: Path) -> None:
    banner = textwrap.dedent(
        f"""
        ================================================================
        🚀  AGI Alpha Node Command Bridge
        ================================================================
        Configuration : {config_path}
        Purpose       : Empower non-technical operators with unstoppable AGI
        ================================================================
        """
    )
    print(banner)


def _print_menu() -> None:
    print(
        textwrap.dedent(
            """
            Select an action:
              [1] Bootstrap node (ENS verification + stake)
              [2] Execute one autonomous job cycle
              [3] View status snapshot
              [4] Stake additional $AGIALPHA
              [5] Withdraw stake
              [6] Restake accumulated rewards
              [7] Rotate governance address
              [8] Run emergency pause drill
              [9] Display compliance scorecard
              [0] Exit
            """
        )
    )


def _resolve_amount(raw: str) -> int:
    value = raw.strip().replace("_", "")
    if not value.isdigit():
        raise ValueError("Amount must be a positive integer")
    return int(value)


def _serialise(obj: object) -> object:
    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, list):
        return [_serialise(item) for item in obj]
    return obj


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the AGI Alpha Node demo")
    parser.add_argument("--config", required=True, help="Configuration file")
    args = parser.parse_args()

    config_path = Path(args.config)
    config = AlphaNodeConfig.load(config_path)
    node = AlphaNode(config=config)
    _print_header(config_path)

    while True:
        _print_menu()
        choice = _prompt("Enter selection: ").strip()
        if choice == "1":
            report = node.bootstrap()
            print("✅ Bootstrap complete. Compliance: %.2f" % report.overall)
        elif choice == "2":
            report = node.run_once()
            if report:
                payload = {
                    "decisions": [asdict(decision) for decision in report.decisions],
                    "specialists": {k: asdict(v) for k, v in report.specialist_outputs.items()},
                }
                print(json.dumps(payload, indent=2))
            else:
                print("No jobs available to execute.")
        elif choice == "3":
            print(json.dumps(asdict(node.state_snapshot()), indent=2))
        elif choice == "4":
            try:
                amount = _resolve_amount(_prompt("Stake amount: "))
            except ValueError as exc:
                print(f"Input error: {exc}")
                continue
            status = node.stake(amount)
            print(json.dumps(_serialise(status), indent=2))
        elif choice == "5":
            try:
                amount = _resolve_amount(_prompt("Withdraw amount: "))
            except ValueError as exc:
                print(f"Input error: {exc}")
                continue
            status = node.withdraw(amount)
            print(json.dumps(_serialise(status), indent=2))
        elif choice == "6":
            event = node.claim_rewards()
            if event:
                print(json.dumps(_serialise(event), indent=2))
            else:
                print("No rewards available for restaking.")
        elif choice == "7":
            address = _prompt("New governance address (0x…): ").strip()
            node.update_governance(address)
            print(f"Governance rotated to {address}")
        elif choice == "8":
            node.run_safety_drill()
            print("Emergency pause drill executed and logged.")
        elif choice == "9":
            report = node.compliance_report()
            print("Composite Compliance Score: %.2f" % report.overall)
            for name, dimension in report.dimensions.items():
                print(f"  - {name.title()}: {dimension.score:.2f} ({dimension.rationale})")
        elif choice == "0":
            node.shutdown()
            print("Shutting down. Stay sovereign.")
            break
        else:
            print("Invalid selection. Please choose a valid option.")


if __name__ == "__main__":
    main()
