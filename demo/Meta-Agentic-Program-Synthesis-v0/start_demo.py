"""Command-line entrypoint for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from textwrap import indent
from typing import Mapping

from meta_agentic_demo.admin import OwnerConsole, load_owner_overrides
from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.governance import GovernanceTimelock
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
    verification_group = parser.add_argument_group("Verification policy")
    verification_group.add_argument(
        "--verification-holdout-threshold",
        type=float,
        help="Override minimum acceptable holdout score",
    )
    verification_group.add_argument(
        "--verification-residual-mean",
        type=float,
        help="Override residual mean tolerance",
    )
    verification_group.add_argument(
        "--verification-residual-std",
        type=float,
        help="Override residual standard deviation minimum",
    )
    verification_group.add_argument(
        "--verification-divergence",
        type=float,
        help="Override maximum allowed holdout divergence",
    )
    governance_group = parser.add_argument_group("Governance timelock")
    governance_group.add_argument(
        "--timelock-delay",
        type=float,
        default=0.0,
        help="Seconds to delay owner overrides via the governance timelock",
    )
    governance_group.add_argument(
        "--timelock-fast-forward",
        type=float,
        default=0.0,
        help="Advance the timelock clock by N seconds before execution",
    )
    return parser.parse_args()


def describe_config(config: DemoConfig) -> str:
    summary = config.as_summary()
    return json.dumps(summary, indent=2)


def main() -> None:
    args = parse_args()
    scenario = next(s for s in SCENARIOS if s.identifier == args.scenario)
    owner_console = OwnerConsole(DemoConfig(scenarios=SCENARIOS))
    timelock = GovernanceTimelock(
        default_delay=timedelta(seconds=max(args.timelock_delay, 0.0))
    )
    scheduled_actions = []

    def queue_timelock(action: str, payload: Mapping[str, object]) -> bool:
        try:
            scheduled_actions.append(timelock.schedule(action, payload))
            return True
        except (ValueError, KeyError) as error:
            print("❌ Owner override error:", error)
            return False

    try:
        if args.config_file:
            overrides = load_owner_overrides(args.config_file)
            reward_overrides = overrides.get("reward_policy", {})
            if reward_overrides and not queue_timelock("update_reward_policy", reward_overrides):
                return
            stake_overrides = overrides.get("stake_policy", {})
            if stake_overrides and not queue_timelock("update_stake_policy", stake_overrides):
                return
            evolution_overrides = overrides.get("evolution_policy", {})
            if evolution_overrides and not queue_timelock(
                "update_evolution_policy", evolution_overrides
            ):
                return
            verification_overrides = overrides.get("verification_policy", {})
            if verification_overrides and not queue_timelock(
                "update_verification_policy", verification_overrides
            ):
                return
            if "paused" in overrides:
                if not queue_timelock("set_paused", {"value": bool(overrides["paused"]) }):
                    return
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
        if reward_overrides and not queue_timelock("update_reward_policy", reward_overrides):
            return
        stake_overrides = {
            key: value
            for key, value in {
                "minimum_stake": args.stake_minimum,
                "slash_fraction": args.stake_slash_fraction,
                "inactivity_timeout_seconds": args.stake_timeout,
            }.items()
            if value is not None
        }
        if stake_overrides and not queue_timelock("update_stake_policy", stake_overrides):
            return
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
        if evolution_overrides and not queue_timelock(
            "update_evolution_policy", evolution_overrides
        ):
            return
        verification_overrides = {
            key: value
            for key, value in {
                "holdout_threshold": args.verification_holdout_threshold,
                "residual_mean_tolerance": args.verification_residual_mean,
                "residual_std_minimum": args.verification_residual_std,
                "divergence_tolerance": args.verification_divergence,
            }.items()
            if value is not None
        }
        if verification_overrides and not queue_timelock(
            "update_verification_policy", verification_overrides
        ):
            return
        if args.pause and not queue_timelock("set_paused", {"value": True}):
            return
    except ValueError as error:
        print("❌ Owner override error:", error)
        return

    fast_forward_seconds = max(args.timelock_fast_forward, 0.0)
    execution_time = datetime.now(UTC) + timedelta(seconds=fast_forward_seconds)
    try:
        executed_actions = tuple(timelock.execute_due(owner_console, now=execution_time))
    except ValueError as error:
        print("❌ Timelock execution error:", error)
        return

    if scheduled_actions:
        print("\n🛡️ Governance timelock queue:")
        for action in timelock.pending():
            eta = action.eta.isoformat(timespec="seconds")
            status = action.status
            if action.executed_at:
                status = f"{status} at {action.executed_at.isoformat(timespec='seconds')}"
            print(
                f"  • {action.name} -> {dict(action.payload)} (ETA {eta}) :: {status}"
            )
        if fast_forward_seconds > 0:
            print(
                f"  • Timelock fast-forward applied: +{fast_forward_seconds:.1f} seconds"
            )
        if executed_actions:
            print(f"  • Executed {len(executed_actions)} action(s) ready for execution")

    config = owner_console.config
    architect = SovereignArchitect(
        config=config,
        owner_console=owner_console,
        timelock=timelock,
    )
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
    print(f"Improvement vs first generation: {artefacts.improvement_over_first:.4f}")
    if artefacts.first_success_generation is not None:
        print(
            "Success threshold achieved at generation",
            artefacts.first_success_generation,
        )
    else:
        print("Success threshold not reached within configured generations.")
    summary = artefacts.reward_summary
    print("\n💠 Reward distribution overview:")
    print(f"  • Total disbursed: {summary.total_reward:.2f} $AGIα")
    print(f"  • Architect retained: {summary.architect_total:.2f} $AGIα")
    if summary.top_solver:
        print(
            f"  • Top solver: {summary.top_solver} "
            f"({summary.solver_totals[summary.top_solver]:.2f} $AGIα)"
        )
    else:
        print("  • Top solver: N/A")
    if summary.top_validator:
        print(
            f"  • Top validator: {summary.top_validator} "
            f"({summary.validator_totals[summary.top_validator]:.2f} $AGIα)"
        )
    else:
        print("  • Top validator: N/A")
    verification = artefacts.verification
    print("\n🔍 Multi-angle verification checks:")
    for name, score in sorted(verification.holdout_scores.items()):
        print(f"  • {name}: {score:.4f}")
    print(
        f"  • Residual mean {verification.residual_mean:+.4f} | std {verification.residual_std:.4f}"
    )
    print(
        f"  • Holdout divergence {verification.divergence:.4f}"
        f" | pass gates: holdout={verification.pass_holdout}, residual={verification.pass_residual_balance},"
        f" divergence={verification.pass_divergence}"
    )
    print(
        "  • Overall verification verdict:",
        "PASS" if verification.overall_pass else "ATTENTION REQUIRED",
    )
    if owner_console.events:
        print("\n🛡️ Owner interventions during run:")
        for event in owner_console.events:
            print(
                indent(
                    f"{event.timestamp.isoformat()} • {event.action} → {json.dumps(event.payload, sort_keys=True)}",
                    prefix="  - ",
                )
            )
    else:
        print("\n🛡️ Owner interventions during run: none required.")


if __name__ == "__main__":
    main()
