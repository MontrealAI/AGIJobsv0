"""Owner control utilities for the Meta-Agentic Program Synthesis demo."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping

from .config import (
    DemoConfig,
    EvolutionPolicy,
    RewardPolicy,
    StakePolicy,
    VerificationPolicy,
)
from .entities import OwnerAction


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
    _VERIFICATION_KEYS = {
        "holdout_threshold",
        "residual_mean_tolerance",
        "residual_std_minimum",
        "divergence_tolerance",
        "mae_threshold",
        "monotonic_tolerance",
        "bootstrap_iterations",
        "confidence_level",
        "stress_threshold",
        "entropy_floor",
        "precision_replay_tolerance",
        "variance_ratio_ceiling",
        "spectral_energy_ceiling",
    }

    def __init__(self, config: DemoConfig) -> None:
        self._config = config
        self._paused = False
        self._events: list[OwnerAction] = []

    # ------------------------------------------------------------------
    # Public API
    @property
    def config(self) -> DemoConfig:
        return self._config

    @property
    def is_paused(self) -> bool:
        return self._paused

    def pause(self) -> None:
        if not self._paused:
            self._paused = True
            self._record_event("pause", {"value": True})

    def resume(self) -> None:
        if self._paused:
            self._paused = False
            self._record_event("resume", {"value": False})

    def set_paused(self, value: bool) -> None:
        value = bool(value)
        if self._paused == value:
            return
        self._paused = value
        self._record_event("set_paused", {"value": value})

    def require_active(self) -> None:
        if self._paused:
            raise RuntimeError("operations are paused by the contract owner")

    @property
    def events(self) -> tuple[OwnerAction, ...]:
        return tuple(self._events)

    def update_reward_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs("reward_policy", kwargs, self._REWARD_KEYS)
        if not overrides:
            return
        policy = replace(self._config.reward_policy, **overrides)
        self._validate_reward_policy(policy)
        self._config = replace(self._config, reward_policy=policy)
        self._record_event("update_reward_policy", overrides)

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
        self._record_event("update_stake_policy", overrides)

    def update_evolution_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs("evolution_policy", kwargs, self._EVOLUTION_KEYS)
        if not overrides:
            return
        policy = replace(self._config.evolution_policy, **overrides)
        self._validate_evolution_policy(policy)
        self._config = replace(self._config, evolution_policy=policy)
        self._record_event("update_evolution_policy", overrides)

    def update_verification_policy(self, **kwargs: float) -> None:
        overrides = self._validate_kwargs(
            "verification_policy", kwargs, self._VERIFICATION_KEYS
        )
        if not overrides:
            return
        policy = replace(self._config.verification_policy, **overrides)
        self._validate_verification_policy(policy)
        self._config = replace(self._config, verification_policy=policy)
        self._record_event("update_verification_policy", overrides)

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
        verification_overrides = overrides.get("verification_policy", {})
        if verification_overrides:
            self.update_verification_policy(**verification_overrides)
        if "paused" in overrides:
            self.set_paused(bool(overrides["paused"]))

    # ------------------------------------------------------------------
    # Event recording
    def _record_event(self, action: str, payload: Mapping[str, Any]) -> None:
        self._events.append(
            OwnerAction(
                timestamp=datetime.now(UTC),
                action=action,
                payload=dict(payload),
            )
        )

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

    def _validate_verification_policy(self, policy: VerificationPolicy) -> None:
        if not 0 <= policy.holdout_threshold <= 1:
            raise ValueError("holdout_threshold must be between 0 and 1")
        if policy.residual_mean_tolerance < 0:
            raise ValueError("residual_mean_tolerance must be non-negative")
        if policy.residual_std_minimum < 0:
            raise ValueError("residual_std_minimum must be non-negative")
        if policy.divergence_tolerance < 0:
            raise ValueError("divergence_tolerance must be non-negative")
        if not 0 <= policy.mae_threshold <= 1:
            raise ValueError("mae_threshold must be between 0 and 1")
        if policy.monotonic_tolerance < 0:
            raise ValueError("monotonic_tolerance must be non-negative")
        if policy.bootstrap_iterations < 1:
            raise ValueError("bootstrap_iterations must be at least 1")
        if not 0 < policy.confidence_level < 1:
            raise ValueError("confidence_level must be between 0 and 1")
        if not 0 <= policy.stress_threshold <= 1:
            raise ValueError("stress_threshold must be between 0 and 1")
        if not 0 <= policy.entropy_floor <= 1:
            raise ValueError("entropy_floor must be between 0 and 1")
        if policy.precision_replay_tolerance < 0:
            raise ValueError("precision_replay_tolerance must be non-negative")
        if policy.variance_ratio_ceiling <= 0:
            raise ValueError("variance_ratio_ceiling must be positive")
        if not 0 < policy.spectral_energy_ceiling <= 1:
            raise ValueError("spectral_energy_ceiling must be within (0, 1]")


def load_owner_overrides(path: Path) -> Mapping[str, Any]:
    """Load overrides from a JSON file."""

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, Mapping):
        raise ValueError("override file must contain a JSON object")
    return data


__all__ = ["OwnerConsole", "load_owner_overrides"]
