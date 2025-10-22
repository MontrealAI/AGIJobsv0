"""Command-line entrypoint for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import argparse
import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path
from textwrap import indent
from typing import Mapping

from meta_agentic_demo.admin import OwnerConsole, load_owner_overrides
from meta_agentic_demo.config import DatasetProfile, DemoConfig, DemoScenario
from meta_agentic_demo.entities import DemoRunArtifacts
from meta_agentic_demo.governance import GovernanceTimelock
from meta_agentic_demo.orchestrator import SovereignArchitect
from meta_agentic_demo.report import ReportBundle, export_report


ALL_SCENARIOS_IDENTIFIER = "all"

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
        dataset_profile=DatasetProfile(length=64, noise=0.05, seed=1_337),
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
        dataset_profile=DatasetProfile(length=72, noise=0.06, seed=4_242),
        stress_multiplier=1.1,
    ),
    DemoScenario(
        identifier="sovereign",
        title="Sovereign Hyperdrive Forge",
        description=(
            "Let the sovereign architect synthesise breakthrough control kernels across "
            "markets, operations, and intelligence — compressing cycles to minutes."
        ),
        target_metric="Hyperdrive innovation index",
        success_threshold=0.85,
        dataset_profile=DatasetProfile(length=96, noise=0.07, seed=90_900),
        stress_multiplier=1.35,
    ),
]

SCENARIO_LOOKUP = {scenario.identifier: scenario for scenario in SCENARIOS}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scenario",
        choices=[*SCENARIO_LOOKUP, ALL_SCENARIOS_IDENTIFIER],
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
    verification_group.add_argument(
        "--verification-mae-threshold",
        type=float,
        help="Override acceptable MAE-derived score threshold",
    )
    verification_group.add_argument(
        "--verification-monotonic",
        type=float,
        help="Override tolerance for monotonic improvement checks",
    )
    verification_group.add_argument(
        "--verification-bootstrap",
        type=int,
        help="Override bootstrap iteration count",
    )
    verification_group.add_argument(
        "--verification-confidence",
        type=float,
        help="Override bootstrap confidence level (0-1)",
    )
    verification_group.add_argument(
        "--verification-stress-threshold",
        type=float,
        help="Override minimum acceptable stress test score",
    )
    verification_group.add_argument(
        "--verification-entropy",
        type=float,
        help="Override minimum acceptable entropy score",
    )
    verification_group.add_argument(
        "--verification-precision-tolerance",
        type=float,
        help="Override tolerance for decimal replay consistency",
    )
    verification_group.add_argument(
        "--verification-variance-ceiling",
        type=float,
        help="Override maximum acceptable variance ratio",
    )
    verification_group.add_argument(
        "--verification-spectral-ceiling",
        type=float,
        help="Override maximum acceptable spectral energy ratio",
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
    selected_scenarios = (
        list(SCENARIOS)
        if args.scenario == ALL_SCENARIOS_IDENTIFIER
        else [SCENARIO_LOOKUP[args.scenario]]
    )
    multi_run = len(selected_scenarios) > 1
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
            if "paused" in overrides and not queue_timelock(
                "set_paused", {"value": bool(overrides["paused"]) }
            ):
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
                "mae_threshold": args.verification_mae_threshold,
                "monotonic_tolerance": args.verification_monotonic,
                "bootstrap_iterations": args.verification_bootstrap,
                "confidence_level": args.verification_confidence,
                "stress_threshold": args.verification_stress_threshold,
                "entropy_floor": args.verification_entropy,
                "precision_replay_tolerance": args.verification_precision_tolerance,
                "variance_ratio_ceiling": args.verification_variance_ceiling,
                "spectral_energy_ceiling": args.verification_spectral_ceiling,
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
    aggregated_results: dict[str, DemoRunArtifacts] = {}
    bundles: dict[str, ReportBundle] = {}

    for index, scenario in enumerate(selected_scenarios, start=1):
        architect = SovereignArchitect(
            config=config,
            owner_console=owner_console,
            timelock=timelock,
        )
        header = f"Scenario {index}/{len(selected_scenarios)}" if multi_run else "Scenario"
        print(f"\n🚀 {header}: {scenario.title}")
        print(indent(scenario.description, prefix="  > "))
        print("\n🧭 Configuration:")
        print(indent(describe_config(config), prefix="  "))
        if scenario.dataset_profile:
            profile = scenario.dataset_profile
            print(
                "\n🧪 Scenario dataset profile:",
                f"length={profile.length}, noise={profile.noise:.3f}, seed={profile.seed}",
            )
        if not math.isclose(scenario.stress_multiplier, 1.0):
            print(
                f"\n🌡️ Stress profile amplified: {scenario.stress_multiplier:.2f}× thermodynamic stress battery",
            )
        if owner_console.is_paused:
            print("\n⏸️ Operations paused by owner. Resume to execute jobs.")
            return
        artefacts = architect.run(scenario)
        output_dir = args.output / scenario.identifier if multi_run else args.output
        bundle = export_report(artefacts, output_dir)
        aggregated_results[scenario.identifier] = artefacts
        bundles[scenario.identifier] = bundle
        print("\n✅ Demo complete. Artefacts written to:")
        print(f"  • JSON: {bundle.json_path}")
        print(f"  • HTML: {bundle.html_path}")
        print("\n🏁 Final program:")
        print(indent(artefacts.final_program, prefix="  "))
        print(f"Composite score: {artefacts.final_score:.4f}")
        print(f"Improvement vs first generation: {artefacts.improvement_over_first:.4f}")
        print(f"Stress multiplier applied: {architect.stress_multiplier:.2f}×")
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
                f"  • Top solver: {summary.top_solver} -> {summary.solver_totals[summary.top_solver]:.2f} $AGIα"
            )
        if summary.top_validator:
            print(
                "  • Top validator:",
                summary.top_validator,
                "->",
                f"{summary.validator_totals[summary.top_validator]:.2f} $AGIα",
            )
        print("\n🧵 Triple-verification digest:")
        digest = artefacts.verification
        print(
            f"  • Holdout pass: {digest.pass_holdout} (scores={json.dumps(digest.holdout_scores)})"
        )
        print(
            f"  • Residual balance: mean={digest.residual_mean:.4f}, std={digest.residual_std:.4f}, pass={digest.pass_residual_balance}"
        )
        print(
            f"  • Divergence tolerance: {digest.divergence:.4f} (pass={digest.pass_divergence})"
        )
        print(
            f"  • MAE shield: score={digest.mae_score:.4f} (pass={digest.pass_mae})"
        )
        print(
            f"  • Bootstrap confidence: {digest.bootstrap_interval[0]:.4f}-{digest.bootstrap_interval[1]:.4f}"
            f" @ {digest.pass_confidence}"
        )
        print(
            f"  • Stress battery: {json.dumps(digest.stress_scores)} (threshold={digest.stress_threshold:.2f}, pass={digest.pass_stress})"
        )
        print(
            f"  • Entropy shield: score={digest.entropy_score:.4f} (floor={digest.entropy_floor:.2f}, pass={digest.pass_entropy})"
        )
        print(
            f"  • Precision replay: score={digest.precision_replay_score:.4f}"
            f" (tolerance={owner_console.config.verification_policy.precision_replay_tolerance:.4f}, pass={digest.pass_precision_replay})"
        )
        print(
            f"  • Variance ratio: {digest.variance_ratio:.4f} (ceiling={owner_console.config.verification_policy.variance_ratio_ceiling:.2f}, pass={digest.pass_variance_ratio})"
        )
        print(
            f"  • Spectral leak: {digest.spectral_ratio:.4f} (ceiling={owner_console.config.verification_policy.spectral_energy_ceiling:.2f}, pass={digest.pass_spectral_ratio})"
        )
        print("  • Overall verdict:", "PASS" if digest.overall_pass else "ATTENTION")

        if artefacts.opportunities:
            print("\n📈 Opportunity intelligence cues:")
            for opportunity in artefacts.opportunities:
                print(
                    f"  • {opportunity.name}: impact={opportunity.impact_score:.2f},"
                    f" confidence={opportunity.confidence:.2f} :: {opportunity.narrative}"
                )
        else:
            print("\n📈 No opportunities surfaced during this run.")

        if artefacts.timelock_actions:
            print("\n⏱️ Governance timelock ledger:")
            for action in artefacts.timelock_actions:
                print(
                    f"  • {action.name} (status={action.status}, ETA={action.eta.isoformat(timespec='seconds')})"
                )
        else:
            print("\n⏱️ Governance timelock ledger is empty – sovereign operated in real-time.")

        if artefacts.owner_actions:
            print("\n🛡️ Owner interventions recorded:")
            for action in artefacts.owner_actions:
                print(
                    f"  • {action.timestamp.isoformat(timespec='seconds')} :: {action.action} -> {json.dumps(action.payload)}"
                )
        else:
            print("\n🛡️ Owner interventions not required – configuration remained stable.")

    if multi_run:
        from meta_agentic_demo.report import export_batch_report

        batch_bundle = export_batch_report(
            aggregated_results,
            args.output,
            bundles,
            scenarios={scenario.identifier: scenario for scenario in selected_scenarios},
        )
        print("\n🌌 Mission constellation synthesised:")
        print(f"  • JSON: {batch_bundle.json_path}")
        print(f"  • HTML: {batch_bundle.html_path}")


if __name__ == "__main__":
    main()
