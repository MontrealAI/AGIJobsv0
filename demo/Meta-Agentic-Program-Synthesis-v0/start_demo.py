"""Command-line entrypoint for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from textwrap import indent

from meta_agentic_demo.admin import OwnerConsole, load_owner_overrides
from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import export_report


SCENARIOS = [
    DemoScenario(
        identifier="alpha",
        title="Alpha Efficiency Sweep",
        description=(
            "Ask the sovereign architect to refine an internal automation workflow, "
            "discovering an increasingly efficient control signal."
        ),
        target_metric="Workflow productivity uplift",
        success_threshold=0.82,
    ),
    DemoScenario(
        identifier="atlas",
        title="Atlas Market Sentinel",
        description=(
            "Hunt for cross-market inefficiencies by evolving a forecasting kernel that "
            "beats the benchmark risk-adjusted score."
        ),
        target_metric="Information ratio",
        success_threshold=0.78,
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scenario",
        choices=[scenario.identifier for scenario in SCENARIOS],
        help="Identifier of the narrative to execute",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("demo_output"),
        help="Directory where artefacts should be written",
    )
    parser.add_argument(
        "--config-file",
        type=Path,
        help="Optional JSON file containing owner overrides",
    )

    owner_group = parser.add_argument_group("Owner overrides")
    owner_group.add_argument("--reward-total", type=float, help="Override total reward size")
    owner_group.add_argument(
        "--reward-temperature",
        type=float,
        help="Override thermodynamic temperature",
    )
    owner_group.add_argument(
        "--reward-validator-weight",
        type=float,
        help="Portion of rewards dedicated to validators",
    )
    owner_group.add_argument(
        "--reward-architect-weight",
        type=float,
        help="Portion of rewards retained by the architect",
    )
    owner_group.add_argument(
        "--stake-minimum",
        type=float,
        help="Override minimum stake per agent",
    )
    owner_group.add_argument(
        "--stake-slash-fraction",
        type=float,
        help="Override slashing fraction",
    )
    owner_group.add_argument(
        "--stake-timeout",
        type=float,
        help="Override inactivity timeout in seconds",
    )
    owner_group.add_argument(
        "--evolution-generations",
        type=int,
        help="Override number of generations",
    )
    owner_group.add_argument(
        "--evolution-population",
        type=int,
        help="Override population size",
    )
    owner_group.add_argument(
        "--evolution-elite",
        type=int,
        help="Override elite count",
    )
    owner_group.add_argument(
        "--evolution-mutation",
        type=float,
        help="Override mutation rate",
    )
    owner_group.add_argument(
        "--evolution-crossover",
        type=float,
        help="Override crossover rate",
    )
    owner_group.add_argument(
        "--pause",
        action="store_true",
        help="Pause operations before they begin (no jobs executed)",
    )
    return parser.parse_args()


def describe_config(config: DemoConfig) -> str:
    summary = config.as_summary()
    return json.dumps(summary, indent=2)


def main() -> None:
    args = parse_args()
    scenario = next(s for s in SCENARIOS if s.identifier == args.scenario)
    owner_console = OwnerConsole(DemoConfig(scenarios=SCENARIOS))
    try:
        if args.config_file:
            overrides = load_owner_overrides(args.config_file)
            owner_console.apply_overrides(overrides)
        reward_overrides = {
            key: value
            for key, value in {
                "total_reward": args.reward_total,
                "temperature": args.reward_temperature,
                "validator_weight": args.reward_validator_weight,
                "architect_weight": args.reward_architect_weight,
            }.items()
            if value is not None
        }
        if reward_overrides:
            owner_console.update_reward_policy(**reward_overrides)
        stake_overrides = {
            key: value
            for key, value in {
                "minimum_stake": args.stake_minimum,
                "slash_fraction": args.stake_slash_fraction,
                "inactivity_timeout_seconds": args.stake_timeout,
            }.items()
            if value is not None
        }
        if stake_overrides:
            owner_console.update_stake_policy(**stake_overrides)
        evolution_overrides = {
            key: value
            for key, value in {
                "generations": args.evolution_generations,
                "population_size": args.evolution_population,
                "elite_count": args.evolution_elite,
                "mutation_rate": args.evolution_mutation,
                "crossover_rate": args.evolution_crossover,
            }.items()
            if value is not None
        }
        if evolution_overrides:
            owner_console.update_evolution_policy(**evolution_overrides)
        if args.pause:
            owner_console.pause()
    except ValueError as error:
        print("❌ Owner override error:", error)
        return
    config = owner_console.config
    architect = SovereignArchitect(config=config, owner_console=owner_console)
    print("🚀 Initiating sovereign architect for scenario:", scenario.title)
    print(indent(scenario.description, prefix="  > "))
    print("\n🧭 Configuration:")
    print(indent(describe_config(config), prefix="  "))
    if owner_console.is_paused:
        print("\n⏸️ Operations paused by owner. Resume to execute jobs.")
        return
    artefacts = architect.run(scenario)
    bundle = export_report(artefacts, args.output)
    print("\n✅ Demo complete. Artefacts written to:")
    print(f"  • JSON: {bundle.json_path}")
    print(f"  • HTML: {bundle.html_path}")
    print("\n🏁 Final program:")
    print(indent(artefacts.final_program, prefix="  "))
    print(f"Composite score: {artefacts.final_score:.4f}")


if __name__ == "__main__":
    main()
