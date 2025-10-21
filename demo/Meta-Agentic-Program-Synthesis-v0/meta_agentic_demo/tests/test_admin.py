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
    console.update_reward_policy(total_reward=1500.0, validator_weight=0.2, architect_weight=0.1)
    config = console.config
    assert pytest.approx(config.reward_policy.total_reward) == 1500.0
    assert pytest.approx(config.reward_policy.validator_weight) == 0.2
    assert pytest.approx(config.reward_policy.architect_weight) == 0.1


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


def test_owner_console_apply_overrides_and_load(tmp_path: Path) -> None:
    console = create_console()
    overrides = {
        "reward_policy": {"total_reward": 2000},
        "stake_policy": {"slash_fraction": 0.2},
        "evolution_policy": {"mutation_rate": 0.25},
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


def test_owner_console_rejects_unknown_keys() -> None:
    console = create_console()
    with pytest.raises(ValueError):
        console.update_reward_policy(nonexistent=1.0)  # type: ignore[arg-type]
