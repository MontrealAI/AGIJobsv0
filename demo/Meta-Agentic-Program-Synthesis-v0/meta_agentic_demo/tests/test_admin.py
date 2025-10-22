from __future__ import annotations

import json
from pathlib import Path

import pytest

from meta_agentic_demo.admin import OwnerConsole, load_owner_overrides
from meta_agentic_demo.config import DemoConfig, DemoScenario
from meta_agentic_demo.orchestrator import SovereignArchitect


def create_console() -> OwnerConsole:
    scenario = DemoScenario(
        identifier="alpha",
        title="Alpha",
        description="",
        target_metric="score",
        success_threshold=0.5,
    )
    return OwnerConsole(DemoConfig(scenarios=[scenario]))


def test_owner_console_updates_reward_policy() -> None:
    console = create_console()
    assert console.events == ()
    console.update_reward_policy(total_reward=1500.0, validator_weight=0.2, architect_weight=0.1)
    config = console.config
    assert pytest.approx(config.reward_policy.total_reward) == 1500.0
    assert pytest.approx(config.reward_policy.validator_weight) == 0.2
    assert pytest.approx(config.reward_policy.architect_weight) == 0.1
    assert console.events[-1].action == "update_reward_policy"


def test_owner_console_rejects_invalid_reward_policy() -> None:
    console = create_console()
    with pytest.raises(ValueError):
        console.update_reward_policy(validator_weight=0.8, architect_weight=0.5)


def test_owner_console_pause_and_resume_blocks_execution() -> None:
    console = create_console()
    architect = SovereignArchitect(config=console.config, owner_console=console)
    console.pause()
    with pytest.raises(RuntimeError):
        architect.run(console.config.scenarios[0])
    console.resume()
    artefacts = architect.run(console.config.scenarios[0])
    assert artefacts.final_score > 0
    actions = [event.action for event in console.events]
    assert actions.count("pause") == 1
    assert actions.count("resume") == 1


def test_owner_console_updates_stake_and_evolution() -> None:
    console = create_console()
    console.update_stake_policy(minimum_stake=500.0, inactivity_timeout_seconds=45)
    console.update_evolution_policy(generations=6, population_size=8, elite_count=2)
    config = console.config
    assert pytest.approx(config.stake_policy.minimum_stake) == 500.0
    assert config.stake_policy.inactivity_timeout.total_seconds() == pytest.approx(45)
    assert config.evolution_policy.generations == 6
    assert config.evolution_policy.population_size == 8
    assert config.evolution_policy.elite_count == 2
    actions = [event.action for event in console.events]
    assert "update_stake_policy" in actions
    assert "update_evolution_policy" in actions


def test_owner_console_updates_verification_policy() -> None:
    console = create_console()
    console.update_verification_policy(
        holdout_threshold=0.85,
        residual_mean_tolerance=0.03,
        residual_std_minimum=0.01,
        divergence_tolerance=0.12,
        mae_threshold=0.74,
        monotonic_tolerance=0.015,
        bootstrap_iterations=300,
        confidence_level=0.9,
        stress_threshold=0.73,
        entropy_floor=0.45,
        precision_replay_tolerance=0.012,
        variance_ratio_ceiling=1.1,
        spectral_energy_ceiling=0.48,
        skewness_ceiling=1.25,
        kurtosis_ceiling=4.0,
        jackknife_tolerance=0.03,
    )
    policy = console.config.verification_policy
    assert pytest.approx(policy.holdout_threshold) == 0.85
    assert pytest.approx(policy.residual_mean_tolerance) == 0.03
    assert pytest.approx(policy.residual_std_minimum) == 0.01
    assert pytest.approx(policy.divergence_tolerance) == 0.12
    assert pytest.approx(policy.mae_threshold) == 0.74
    assert pytest.approx(policy.monotonic_tolerance) == 0.015
    assert policy.bootstrap_iterations == 300
    assert pytest.approx(policy.confidence_level) == 0.9
    assert pytest.approx(policy.stress_threshold) == 0.73
    assert pytest.approx(policy.entropy_floor) == 0.45
    assert pytest.approx(policy.precision_replay_tolerance) == 0.012
    assert pytest.approx(policy.variance_ratio_ceiling) == 1.1
    assert pytest.approx(policy.spectral_energy_ceiling) == 0.48
    assert pytest.approx(policy.skewness_ceiling) == 1.25
    assert pytest.approx(policy.kurtosis_ceiling) == 4.0
    assert pytest.approx(policy.jackknife_tolerance) == 0.03
    assert console.events[-1].action == "update_verification_policy"


def test_owner_console_rejects_invalid_verification_policy() -> None:
    console = create_console()
    with pytest.raises(ValueError):
        console.update_verification_policy(holdout_threshold=1.5)
    with pytest.raises(ValueError):
        console.update_verification_policy(residual_mean_tolerance=-0.1)
    with pytest.raises(ValueError):
        console.update_verification_policy(mae_threshold=-0.1)
    with pytest.raises(ValueError):
        console.update_verification_policy(bootstrap_iterations=0)
    with pytest.raises(ValueError):
        console.update_verification_policy(confidence_level=1.2)
    with pytest.raises(ValueError):
        console.update_verification_policy(stress_threshold=-0.2)
    with pytest.raises(ValueError):
        console.update_verification_policy(stress_threshold=1.2)
    with pytest.raises(ValueError):
        console.update_verification_policy(entropy_floor=-0.1)
    with pytest.raises(ValueError):
        console.update_verification_policy(entropy_floor=1.5)
    with pytest.raises(ValueError):
        console.update_verification_policy(precision_replay_tolerance=-0.1)
    with pytest.raises(ValueError):
        console.update_verification_policy(variance_ratio_ceiling=0)
    with pytest.raises(ValueError):
        console.update_verification_policy(spectral_energy_ceiling=0)
    with pytest.raises(ValueError):
        console.update_verification_policy(spectral_energy_ceiling=1.5)
    with pytest.raises(ValueError):
        console.update_verification_policy(skewness_ceiling=0)
    with pytest.raises(ValueError):
        console.update_verification_policy(kurtosis_ceiling=0)
    with pytest.raises(ValueError):
        console.update_verification_policy(jackknife_tolerance=-0.1)


def test_owner_console_apply_overrides_and_load(tmp_path: Path) -> None:
    console = create_console()
    overrides = {
        "reward_policy": {"total_reward": 2000},
        "stake_policy": {"slash_fraction": 0.2},
        "evolution_policy": {"mutation_rate": 0.25},
        "verification_policy": {
            "divergence_tolerance": 0.14,
            "mae_threshold": 0.7,
            "bootstrap_iterations": 280,
            "stress_threshold": 0.69,
            "entropy_floor": 0.41,
            "precision_replay_tolerance": 0.02,
            "variance_ratio_ceiling": 1.3,
            "spectral_energy_ceiling": 0.52,
            "skewness_ceiling": 1.4,
            "kurtosis_ceiling": 4.5,
            "jackknife_tolerance": 0.04,
        },
        "paused": True,
    }
    file_path = tmp_path / "overrides.json"
    file_path.write_text(json.dumps(overrides), encoding="utf-8")
    loaded = load_owner_overrides(file_path)
    console.apply_overrides(loaded)
    assert console.is_paused
    assert pytest.approx(console.config.reward_policy.total_reward) == 2000
    assert pytest.approx(console.config.stake_policy.slash_fraction) == 0.2
    assert pytest.approx(console.config.evolution_policy.mutation_rate) == 0.25
    verification_policy = console.config.verification_policy
    assert pytest.approx(verification_policy.divergence_tolerance) == 0.14
    assert pytest.approx(verification_policy.mae_threshold) == 0.7
    assert verification_policy.bootstrap_iterations == 280
    assert pytest.approx(verification_policy.stress_threshold) == 0.69
    assert pytest.approx(verification_policy.entropy_floor) == 0.41
    assert pytest.approx(verification_policy.precision_replay_tolerance) == 0.02
    assert pytest.approx(verification_policy.variance_ratio_ceiling) == 1.3
    assert pytest.approx(verification_policy.spectral_energy_ceiling) == 0.52
    assert pytest.approx(verification_policy.skewness_ceiling) == 1.4
    assert pytest.approx(verification_policy.kurtosis_ceiling) == 4.5
    assert pytest.approx(verification_policy.jackknife_tolerance) == 0.04
    assert any(event.action == "set_paused" for event in console.events)


def test_owner_console_updates_scenarios_merge() -> None:
    console = create_console()
    console.update_scenarios_from_payload(
        {
            "mode": "merge",
            "scenarios": [
                {
                    "identifier": "alpha",
                    "title": "Alpha Reforged",
                    "stress_multiplier": 1.25,
                },
                {
                    "identifier": "nova",
                    "title": "Nova",
                    "description": "New sovereign arena",
                    "target_metric": "resilience",
                    "success_threshold": 0.72,
                    "dataset_profile": {
                        "length": 48,
                        "noise": 0.04,
                        "seed": 777,
                    },
                    "stress_multiplier": 1.4,
                },
            ],
        }
    )
    scenarios = console.config.scenarios
    assert len(scenarios) == 2
    assert scenarios[0].title == "Alpha Reforged"
    assert pytest.approx(scenarios[0].stress_multiplier) == 1.25
    assert scenarios[1].identifier == "nova"
    assert scenarios[1].dataset_profile and scenarios[1].dataset_profile.length == 48
    assert console.events[-1].action == "update_scenarios"


def test_owner_console_updates_scenarios_replace() -> None:
    console = create_console()
    console.update_scenarios_from_payload(
        {
            "mode": "replace",
            "scenarios": [
                {
                    "identifier": "beta",
                    "title": "Beta Vanguard",
                    "description": "Fresh initiative",
                    "target_metric": "velocity",
                    "success_threshold": 0.68,
                    "stress_multiplier": 1.05,
                }
            ],
        }
    )
    scenarios = console.config.scenarios
    assert len(scenarios) == 1
    assert scenarios[0].identifier == "beta"
    assert scenarios[0].title == "Beta Vanguard"


def test_owner_console_rejects_invalid_scenario_payload() -> None:
    console = create_console()
    with pytest.raises(ValueError):
        console.update_scenarios_from_payload({"scenarios": [{"title": "Invalid"}]})


def test_owner_console_rejects_unknown_keys() -> None:
    console = create_console()
    with pytest.raises(ValueError):
        console.update_reward_policy(nonexistent=1.0)  # type: ignore[arg-type]
