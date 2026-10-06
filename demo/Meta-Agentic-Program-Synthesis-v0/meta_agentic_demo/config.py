"""Configuration models for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Dict, List, Optional


def _number(value: object, name: str, low: float = 0, high: float = 1e12) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be finite and within [{low}, {high}]")


def _integer(value: object, name: str, low: int, high: int) -> None:
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name} must be an integer within [{low}, {high}]")


@dataclass(frozen=True)
class RewardPolicy:
    """Parameters controlling thermodynamic token allocation."""

    total_reward: float = 1000.0
    temperature: float = 1.4
    validator_weight: float = 0.15
    architect_weight: float = 0.1

    def __post_init__(self) -> None:
        _number(self.total_reward, "total_reward")
        _number(self.temperature, "temperature", 1e-9, 1e6)
        _number(self.validator_weight, "validator_weight", 0, 1)
        _number(self.architect_weight, "architect_weight", 0, 1)
        if self.validator_weight + self.architect_weight > 1:
            raise ValueError("reward weights exceed total allocation")

    def to_dict(self) -> Dict[str, float | int]:
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

    def __post_init__(self) -> None:
        _number(self.minimum_stake, "minimum_stake")
        _number(self.slash_fraction, "slash_fraction", 0, 1)
        _number(self.inactivity_timeout.total_seconds(), "inactivity_timeout", 1e-6)

    def to_dict(self) -> Dict[str, float | int]:
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

    def __post_init__(self) -> None:
        _integer(self.generations, "generations", 1, 1000)
        _integer(self.population_size, "population_size", 2, 1000)
        _integer(self.elite_count, "elite_count", 1, self.population_size - 1)
        if self.generations * self.population_size > 100000:
            raise ValueError("evaluation budget exceeds 100000 candidates")
        _number(self.mutation_rate, "mutation_rate", 0, 1)
        _number(self.crossover_rate, "crossover_rate", 0, 1)

    def to_dict(self) -> Dict[str, float | int]:
        return {
            "generations": self.generations,
            "population_size": self.population_size,
            "elite_count": self.elite_count,
            "mutation_rate": self.mutation_rate,
            "crossover_rate": self.crossover_rate,
        }


@dataclass(frozen=True)
class VerificationPolicy:
    """Parameters driving multi-angle verification of evolved programs."""

    holdout_threshold: float = 0.75
    residual_mean_tolerance: float = 0.05
    residual_std_minimum: float = 0.02
    divergence_tolerance: float = 0.2
    mae_threshold: float = 0.7
    monotonic_tolerance: float = 0.025
    bootstrap_iterations: int = 256
    confidence_level: float = 0.95
    stress_threshold: float = 0.72
    entropy_floor: float = 0.35
    precision_replay_tolerance: float = 0.025
    variance_ratio_ceiling: float = 1.25
    spectral_energy_ceiling: float = 0.55
    skewness_ceiling: float = 1.35
    kurtosis_ceiling: float = 4.25
    jackknife_tolerance: float = 0.05

    def __post_init__(self) -> None:
        for name, value in self.to_dict().items():
            _number(value, name)
        _integer(self.bootstrap_iterations, "bootstrap_iterations", 1, 10000)
        for name in ("holdout_threshold", "mae_threshold", "stress_threshold", "entropy_floor"):
            _number(getattr(self, name), name, 0, 1)
        _number(self.confidence_level, "confidence_level", 1e-9, 1 - 1e-9)
        _number(self.spectral_energy_ceiling, "spectral_energy_ceiling", 1e-9, 1)
        for name in ("variance_ratio_ceiling", "skewness_ceiling", "kurtosis_ceiling"):
            _number(getattr(self, name), name, 1e-9)

    def to_dict(self) -> Dict[str, float | int]:
        return {
            "holdout_threshold": self.holdout_threshold,
            "residual_mean_tolerance": self.residual_mean_tolerance,
            "residual_std_minimum": self.residual_std_minimum,
            "divergence_tolerance": self.divergence_tolerance,
            "mae_threshold": self.mae_threshold,
            "monotonic_tolerance": self.monotonic_tolerance,
            "bootstrap_iterations": self.bootstrap_iterations,
            "confidence_level": self.confidence_level,
            "stress_threshold": self.stress_threshold,
            "entropy_floor": self.entropy_floor,
            "precision_replay_tolerance": self.precision_replay_tolerance,
            "variance_ratio_ceiling": self.variance_ratio_ceiling,
            "spectral_energy_ceiling": self.spectral_energy_ceiling,
            "skewness_ceiling": self.skewness_ceiling,
            "kurtosis_ceiling": self.kurtosis_ceiling,
            "jackknife_tolerance": self.jackknife_tolerance,
        }


@dataclass(frozen=True)
class DatasetProfile:
    """Shape parameters used to generate scenario-specific datasets."""

    length: int = 64
    noise: float = 0.05
    seed: int = 1_337

    def __post_init__(self) -> None:
        _integer(self.length, "dataset length", 2, 4096)
        _number(self.noise, "dataset noise", 0, 100)
        _integer(self.seed, "dataset seed", 0, 2**53 - 1)

    def to_dict(self) -> Dict[str, float | int]:
        return {"length": self.length, "noise": self.noise, "seed": self.seed}


@dataclass(frozen=True)
class DemoScenario:
    """Scenario definition surfaced to the non-technical user."""

    identifier: str
    title: str
    description: str
    target_metric: str
    success_threshold: float
    dataset_profile: Optional[DatasetProfile] = None
    stress_multiplier: float = 1.0

    def __post_init__(self) -> None:
        if not isinstance(self.identifier, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", self.identifier) or self.identifier == "all":
            raise ValueError("scenario identifier must be a safe single path component, excluding 'all'")
        _number(self.success_threshold, "success_threshold", 0, 1)
        _number(self.stress_multiplier, "stress_multiplier", 0, 100)

    def to_dict(self) -> Dict[str, object]:
        return {
            "identifier": self.identifier,
            "title": self.title,
            "description": self.description,
            "target_metric": self.target_metric,
            "success_threshold": self.success_threshold,
            "dataset_profile": self.dataset_profile.to_dict()
            if self.dataset_profile
            else None,
            "stress_multiplier": self.stress_multiplier,
        }


@dataclass
class DemoConfig:
    """Top-level configuration bundle consumed by the orchestrator."""

    reward_policy: RewardPolicy = field(default_factory=RewardPolicy)
    stake_policy: StakePolicy = field(default_factory=StakePolicy)
    evolution_policy: EvolutionPolicy = field(default_factory=EvolutionPolicy)
    verification_policy: VerificationPolicy = field(default_factory=VerificationPolicy)
    scenarios: List[DemoScenario] = field(default_factory=list)

    def as_summary(self) -> Dict[str, object]:
        return {
            "reward_policy": self.reward_policy.to_dict(),
            "stake_policy": self.stake_policy.to_dict(),
            "evolution_policy": self.evolution_policy.to_dict(),
            "verification_policy": self.verification_policy.to_dict(),
            "scenarios": [scenario.to_dict() for scenario in self.scenarios],
        }
