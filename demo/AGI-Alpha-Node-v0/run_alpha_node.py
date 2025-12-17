from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import textwrap
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional


PROJECT_ROOT = Path(__file__).resolve().parent
_LOCAL_IMPORT_PATHS = [
    PROJECT_ROOT,
    PROJECT_ROOT / "src",
    PROJECT_ROOT / "grand_demo",
    PROJECT_ROOT / "grand_demo" / "alpha_node",
    PROJECT_ROOT / "grandiose_alpha_demo" / "src",
]

for _path in _LOCAL_IMPORT_PATHS:
    resolved = _path.resolve()
    if resolved.exists() and str(resolved) not in sys.path:
        sys.path.insert(0, str(resolved))

def _load_module(module_name: str, module_path: Path, *, package: bool = False):
    """Load a module directly from disk without relying on PYTHONPATH.

    Pytest entrypoints executed from outside the demo directory do not receive
    our project root on ``sys.path``. Loading the Alpha Node modules via
    ``importlib`` ensures the CLI remains importable even when invoked through
    ``importlib.util.spec_from_file_location`` in tests.
    """

    search_locations = [str(module_path.parent)] if package else None
    spec = importlib.util.spec_from_file_location(
        module_name, module_path, submodule_search_locations=search_locations
    )
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"Unable to load module: {module_name} from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_load_module("alpha_node", PROJECT_ROOT / "alpha_node" / "__init__.py", package=True)
AlphaNodeConfig = _load_module(
    "alpha_node.config", PROJECT_ROOT / "alpha_node" / "config.py"
).AlphaNodeConfig
AlphaNode = _load_module("alpha_node.node", PROJECT_ROOT / "alpha_node" / "node.py").AlphaNode

DEFAULT_CONFIG = PROJECT_ROOT / "config.toml"


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


def _ensure_bootstrap(node: AlphaNode) -> None:
    state = node.state_snapshot()
    if state.stake_locked < node.config.stake.minimum_stake:
        node.bootstrap()


def _interactive_loop(
    node: AlphaNode, *, input_fn: Callable[[str], str] = _prompt
) -> int:
    while True:
        _print_menu()
        choice = input_fn("Enter selection: ").strip()
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
                amount = _resolve_amount(input_fn("Stake amount: "))
            except ValueError as exc:
                print(f"Input error: {exc}")
                continue
            status = node.stake(amount)
            print(json.dumps(_serialise(status), indent=2))
        elif choice == "5":
            try:
                amount = _resolve_amount(input_fn("Withdraw amount: "))
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
            address = input_fn("New governance address (0x…): ").strip()
            node.update_governance(address)
            print(f"Governance rotated to {address}")
        elif choice == "8":
            evaluation = node.run_safety_drill()
            print("Emergency pause drill executed and logged.")
            print(json.dumps({"safety": asdict(evaluation)}, indent=2))
        elif choice == "9":
            report = node.compliance_report()
            print("Composite Compliance Score: %.2f" % report.overall)
            for name, dimension in report.dimensions.items():
                print(f"  - {name.title()}: {dimension.score:.2f} ({dimension.rationale})")
        elif choice == "0":
            node.shutdown()
            print("Shutting down. Stay sovereign.")
            return 0
        else:
            print("Invalid selection. Please choose a valid option.")


def main(
    argv: Optional[Iterable[str]] = None,
    *,
    input_fn: Callable[[str], str] = _prompt,
    bootstrap_on_demand: bool = True,
) -> int:
    parser = argparse.ArgumentParser(description="Launch the AGI Alpha Node demo")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Configuration file (default: {DEFAULT_CONFIG.name})",
    )
    parser.add_argument(
        "--action",
        choices=["menu", "status", "bootstrap", "run-once", "compliance", "safety-drill"],
        default="status",
        help="Choose an action to run without interactive prompts",
    )
    parser.add_argument(
        "--address",
        help="Governance address for rotation when using the 'bootstrap' action",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    config_path = args.config
    if not config_path.exists():
        parser.error(f"Configuration file not found: {config_path}")

    config = AlphaNodeConfig.load(config_path)
    node = AlphaNode(config=config, base_path=config_path.parent)
    _print_header(config_path)

    if args.action == "menu":
        return _interactive_loop(node, input_fn=input_fn)

    if bootstrap_on_demand and args.action in {"run-once", "compliance"}:
        _ensure_bootstrap(node)

    if args.action == "bootstrap":
        if args.address:
            node.update_governance(args.address)
        report = node.bootstrap()
        print("✅ Bootstrap complete. Compliance: %.2f" % report.overall)
        return 0
    if args.action == "run-once":
        report = node.run_once()
        if report:
            payload = {
                "decisions": [asdict(decision) for decision in report.decisions],
                "specialists": {k: asdict(v) for k, v in report.specialist_outputs.items()},
            }
            print(json.dumps(payload, indent=2))
        else:
            print("No jobs available to execute.")
        return 0
    if args.action == "status":
        print(json.dumps(asdict(node.state_snapshot()), indent=2))
        return 0
    if args.action == "compliance":
        report = node.compliance_report()
        print("Composite Compliance Score: %.2f" % report.overall)
        for name, dimension in report.dimensions.items():
            print(f"  - {name.title()}: {dimension.score:.2f} ({dimension.rationale})")
        return 0
    if args.action == "safety-drill":
        evaluation = node.run_safety_drill()
        print(json.dumps({"safety": asdict(evaluation)}, indent=2))
        return 0

    parser.error("Unknown action")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
