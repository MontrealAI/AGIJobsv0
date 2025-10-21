"""Configuration models for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Dict, List


@dataclass(frozen=True)
class RewardPolicy:
    """Parameters controlling thermodynamic token allocation."""

    total_reward: float = 1000.0
    temperature: float = 1.4
    validator_weight: float = 0.15
    architect_weight: float = 0.1

    def to_dict(self) -> Dict[str, float]:
        return {
            "total_reward": self.total_reward,
            "temperature": self.temperature,
            "validator_weight": self.validator_weight,
            "architect_weight": self.architect_weight,
        }


@dataclass(frozen=True)
class StakePolicy:
    """Parameters governing collateral requirements and slashing."""

    minimum_stake: float = 250.0
    slash_fraction: float = 0.1
    inactivity_timeout: timedelta = timedelta(seconds=30)

    def to_dict(self) -> Dict[str, float]:
        return {
            "minimum_stake": self.minimum_stake,
            "slash_fraction": self.slash_fraction,
            "inactivity_timeout_seconds": self.inactivity_timeout.total_seconds(),
        }


@dataclass(frozen=True)
class EvolutionPolicy:
    """Configuration for the self-improvement loop."""

    generations: int = 12
    population_size: int = 6
    elite_count: int = 2
    mutation_rate: float = 0.35
    crossover_rate: float = 0.4

    def to_dict(self) -> Dict[str, float]:
        return {
            "generations": self.generations,
            "population_size": self.population_size,
            "elite_count": self.elite_count,
            "mutation_rate": self.mutation_rate,
            "crossover_rate": self.crossover_rate,
        }


@dataclass(frozen=True)
class DemoScenario:
    """Scenario definition surfaced to the non-technical user."""

    identifier: str
    title: str
    description: str
    target_metric: str
    success_threshold: float


@dataclass
class DemoConfig:
    """Top-level configuration bundle consumed by the orchestrator."""

    reward_policy: RewardPolicy = field(default_factory=RewardPolicy)
    stake_policy: StakePolicy = field(default_factory=StakePolicy)
    evolution_policy: EvolutionPolicy = field(default_factory=EvolutionPolicy)
    scenarios: List[DemoScenario] = field(default_factory=list)

    def as_summary(self) -> Dict[str, object]:
        return {
            "reward_policy": self.reward_policy.to_dict(),
            "stake_policy": self.stake_policy.to_dict(),
            "evolution_policy": self.evolution_policy.to_dict(),
            "scenarios": [scenario.__dict__ for scenario in self.scenarios],
        }
