"""Command line interface for the Omega-grade Kardashev-II α-AGI Business 3 demo."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
)

from .scenario import ScenarioError, load_config, parse_scenario
from .visuals import render_mermaid


def build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Launch and administrate the Kardashev-II Omega-Grade α-AGI Business 3 demo. "
            "The CLI is optimised for non-technical operators and orchestrates the full mission."
        )
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent / "config" / "omega_mission.json",
        help="Path to the mission configuration JSON file.",
    )
    parser.add_argument(
        "--cycles",
        type=int,
        default=None,
        help="Optional maximum number of orchestrator cycles before automatic shutdown.",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=10.0,
        help=(
            "Optional duration in seconds to run before stopping. "
            "Use 0 to run until manually stopped (default: 10s)."
        ),
    )
    parser.add_argument(
        "--no-run",
        action="store_true",
        help="Validate the configuration and render planning artefacts without starting the orchestrator.",
    )

    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("plan", help="Render a textual and Mermaid plan for the mission.")
    subparsers.add_parser("status", help="Display the latest mission status snapshot.")
    subparsers.add_parser("ci", help="Validate configuration for continuous integration.")

    init_parser = subparsers.add_parser(
        "init",
        help="Create a working copy of the mission configuration and supportive artefacts for operators.",
    )
    init_parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory where the configuration copy should be created.",
    )

    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = build_cli()
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.command == "init":
        _handle_init(args)
        return
    if args.command == "plan":
        _handle_plan(args)
        return
    if args.command == "status":
        _handle_status(args)
        return
    if args.command == "ci":
        _handle_ci(args)
        return

    scenario = _load_scenario(args.config)
    scenario.config.max_cycles = args.cycles or scenario.config.max_cycles

    if args.no_run:
        _render_plan_to_disk(scenario)
        print("Configuration validated. No run performed.")
        return

    duration = _resolve_duration(args.duration)

    asyncio.run(_run_orchestrator(scenario, duration=duration))


def _resolve_duration(value: float | None) -> float | None:
    """Normalise the requested runtime duration for the demo.

    The demo previously ran indefinitely unless operators supplied ``--duration``. That
    behaviour made quick validation runs cumbersome and risked leaving background
    orchestrator tasks active. We now default to a 10 second showcase, while still
    permitting indefinite runs by passing ``--duration 0``.
    """

    if value is None:
        return 10.0
    if value <= 0:
        return None
    return float(value)


def _handle_init(args: argparse.Namespace) -> None:
    config_path = Path(__file__).resolve().parent / "config" / "omega_mission.json"
    output_dir = args.output_dir or Path.cwd() / "omega-demo"
    output_dir.mkdir(parents=True, exist_ok=True)
    target_config = output_dir / "omega_mission.json"
    target_config.write_text(config_path.read_text(encoding="utf-8"), encoding="utf-8")
    mermaid_path = output_dir / "mission-plan.mmd"
    scenario = _load_scenario(target_config)
    mermaid_path.write_text(render_mermaid(scenario.jobs), encoding="utf-8")
    readme_path = output_dir / "README.md"
    readme_path.write_text(
        """# Kardashev-II Omega-Grade α-AGI Business 3 Operator Kit\n\n"
        "1. Edit `omega_mission.json` to tune mission parameters (stakes, rewards, resource caps).\n"
        "2. Launch the orchestrator with `python -m kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega --config omega_mission.json`.\n"
        "3. Review structured status updates in `storage/status.jsonl` and adjust the control channel with JSON commands.\n"
        """,
        encoding="utf-8",
    )
    print(f"Configuration initialised in {output_dir}")


def _handle_plan(args: argparse.Namespace) -> None:
    scenario = _load_scenario(args.config)
    _render_plan_to_disk(scenario)
    _print_plan_summary(scenario)


def _handle_status(args: argparse.Namespace) -> None:
    scenario = _load_scenario(args.config)
    status_path = scenario.config.status_output_path
    if not status_path or not status_path.exists():
        print("No status file found. Run the orchestrator first.")
        return
    *_, last_line = status_path.read_text(encoding="utf-8").splitlines() or [""]
    if not last_line:
        print("Status file is empty.")
        return
    payload = json.loads(last_line)
    print(json.dumps(payload, indent=2))


def _handle_ci(args: argparse.Namespace) -> None:
    scenario = _load_scenario(args.config)
    _render_plan_to_disk(scenario)
    _print_plan_summary(scenario)


def _load_scenario(config_path: Path):
    config_path = config_path.expanduser().resolve()
    if not config_path.exists():
        raise SystemExit(f"Configuration file not found: {config_path}")
    try:
        payload = load_config(config_path)
        scenario = parse_scenario(payload, config_path=config_path)
    except ScenarioError as exc:
        raise SystemExit(str(exc)) from exc
    return scenario


def _render_plan_to_disk(scenario) -> None:
    mermaid = render_mermaid(scenario.jobs)
    ui_dir = Path(__file__).resolve().parent / "ui"
    ui_dir.mkdir(parents=True, exist_ok=True)
    (ui_dir / "mission-plan.mmd").write_text(mermaid, encoding="utf-8")


def _print_plan_summary(scenario) -> None:
    print(f"Mission: {scenario.config.mission_name}")
    print(f"Operator account: {scenario.config.operator_account}")
    print(
        "Resources: energy_capacity={:.0f} compute_capacity={:.0f} base_tokens={:.0f}".format(
            scenario.config.energy_capacity,
            scenario.config.compute_capacity,
            scenario.config.base_agent_tokens,
        )
    )
    print("Validators:", ", ".join(scenario.config.validator_names))
    print("Workers:", ", ".join(f"{name} (x{efficiency})" for name, efficiency in scenario.config.worker_specs.items()))
    for node in scenario.jobs:
        _print_node(node, indent=0)


def _print_node(node, *, indent: int) -> None:
    prefix = "  " * indent
    spec = node.payload
    print(
        f"{prefix}- {spec['title']} | reward={spec['reward_tokens']:.0f} | stake={spec['stake_required']:.0f} |"
        f" energy={spec['energy_budget']:.0f} | compute={spec['compute_budget']:.0f}"
    )
    for child in node.children:
        _print_node(child, indent=indent + 1)


async def _run_orchestrator(scenario, *, duration: Optional[float]) -> None:
    orchestrator = Orchestrator(scenario.config)
    await orchestrator.start()
    try:
        if duration is not None:
            await asyncio.sleep(duration)
            await orchestrator.shutdown()
        else:
            await orchestrator.wait_until_stopped()
    except KeyboardInterrupt:  # pragma: no cover - manual intervention
        print("\nOperator requested shutdown via keyboard interrupt.")
        await orchestrator.shutdown()
    finally:
        await orchestrator.wait_until_stopped()
        print(
            "Mission completed at",
            datetime.utcnow().isoformat(timespec="seconds"),
        )
