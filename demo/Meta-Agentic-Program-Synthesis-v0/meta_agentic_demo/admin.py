"""Owner control utilities for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from typing import Any, Mapping

from .config import DemoConfig, EvolutionPolicy, RewardPolicy, StakePolicy


class OwnerConsole:
    """High-level administrative interface exposed to the platform owner."""

    _REWARD_KEYS = {"total_reward", "temperature", "validator_weight", "architect_weight"}
    _STAKE_KEYS = {"minimum_stake", "slash_fraction", "inactivity_timeout_seconds"}
    _EVOLUTION_KEYS = {
        "generations",
        "population_size",
        "elite_count",
        "mutation_rate",
        "crossover_rate",
    }

    def __init__(self, config: DemoConfig) -> None:
        self._config = config
        self._paused = False

    # ------------------------------------------------------------------
    # Public API
    @property
    def config(self) -> DemoConfig:
        return self._config

    @property
    def is_paused(self) -> bool:
        return self._paused

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def set_paused(self, value: bool) -> None:
        self._paused = bool(value)

    def require_active(self) -> None:
        if self._paused:
            raise RuntimeError("operations are paused by the contract owner")

    def update_reward_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs("reward_policy", kwargs, self._REWARD_KEYS)
        if not overrides:
            return
        policy = replace(self._config.reward_policy, **overrides)
        self._validate_reward_policy(policy)
        self._config = replace(self._config, reward_policy=policy)

    def update_stake_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs("stake_policy", kwargs, self._STAKE_KEYS)
        if not overrides:
            return
        mapped: dict[str, Any] = {}
        if "minimum_stake" in overrides:
            mapped["minimum_stake"] = overrides["minimum_stake"]
        if "slash_fraction" in overrides:
            mapped["slash_fraction"] = overrides["slash_fraction"]
        if "inactivity_timeout_seconds" in overrides:
            mapped["inactivity_timeout"] = timedelta(
                seconds=overrides["inactivity_timeout_seconds"]
            )
        policy = replace(self._config.stake_policy, **mapped)
        self._validate_stake_policy(policy)
        self._config = replace(self._config, stake_policy=policy)

    def update_evolution_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs("evolution_policy", kwargs, self._EVOLUTION_KEYS)
        if not overrides:
            return
        policy = replace(self._config.evolution_policy, **overrides)
        self._validate_evolution_policy(policy)
        self._config = replace(self._config, evolution_policy=policy)

    def apply_overrides(self, overrides: Mapping[str, Any]) -> None:
        """Apply overrides loaded from configuration files or CLI mappings."""

        reward_overrides = overrides.get("reward_policy", {})
        if reward_overrides:
            self.update_reward_policy(**reward_overrides)
        stake_overrides = overrides.get("stake_policy", {})
        if stake_overrides:
            self.update_stake_policy(**stake_overrides)
        evolution_overrides = overrides.get("evolution_policy", {})
        if evolution_overrides:
            self.update_evolution_policy(**evolution_overrides)
        if "paused" in overrides:
            self.set_paused(bool(overrides["paused"]))

    # ------------------------------------------------------------------
    # Validation helpers
    def _validate_kwargs(
        self, namespace: str, provided: Mapping[str, Any], allowed: set[str]
    ) -> dict[str, Any]:
        unknown = set(provided) - allowed
        if unknown:
            raise ValueError(
                f"unknown keys for {namespace}: {', '.join(sorted(unknown))}"
            )
        return {key: provided[key] for key in allowed & set(provided)}

    def _validate_reward_policy(self, policy: RewardPolicy) -> None:
        if policy.total_reward < 0:
            raise ValueError("total_reward must be non-negative")
        if policy.temperature <= 0:
            raise ValueError("temperature must be positive")
        if policy.validator_weight < 0 or policy.architect_weight < 0:
            raise ValueError("reward weights must be non-negative")
        if policy.validator_weight + policy.architect_weight > 1:
            raise ValueError("reward weights exceed total allocation")

    def _validate_stake_policy(self, policy: StakePolicy) -> None:
        if policy.minimum_stake < 0:
            raise ValueError("minimum_stake must be non-negative")
        if not 0 <= policy.slash_fraction <= 1:
            raise ValueError("slash_fraction must be between 0 and 1")
        if policy.inactivity_timeout.total_seconds() <= 0:
            raise ValueError("inactivity timeout must be positive")

    def _validate_evolution_policy(self, policy: EvolutionPolicy) -> None:
        if policy.generations < 1:
            raise ValueError("generations must be at least 1")
        if policy.population_size < 2:
            raise ValueError("population_size must be at least 2")
        if not 0 <= policy.elite_count < policy.population_size:
            raise ValueError("elite_count must be less than population_size")
        if not 0 <= policy.mutation_rate <= 1:
            raise ValueError("mutation_rate must be between 0 and 1")
        if not 0 <= policy.crossover_rate <= 1:
            raise ValueError("crossover_rate must be between 0 and 1")


def load_owner_overrides(path: Path) -> Mapping[str, Any]:
    """Load overrides from a JSON file."""

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, Mapping):
        raise ValueError("override file must contain a JSON object")
    return data


__all__ = ["OwnerConsole", "load_owner_overrides"]
