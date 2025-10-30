"""Economic job environment for the MuZero-style demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

FEATURES_PER_JOB = 5
GLOBAL_FEATURES = 2


@dataclass
class EnvironmentConfig:
    """Configuration describing the stochastic planning environment."""

    max_jobs: int = 5
    horizon: int = 6
    rng_seed: int | None = None
    starting_budget: float = 120.0
    min_reward: float = 60.0
    max_reward: float = 240.0
    min_cost: float = 10.0
    max_cost: float = 90.0
    min_success_prob: float = 0.25
    max_success_prob: float = 0.95
    opportunity_std: float = 0.1
    discount: float = 0.997

    def __post_init__(self) -> None:
        if self.max_jobs <= 0:
            raise ValueError("max_jobs must be positive")
        if self.horizon <= 0:
            raise ValueError("horizon must be positive")
        if self.starting_budget <= 0:
            raise ValueError("starting_budget must be positive")
        if not 0.0 < self.min_success_prob < 1.0:
            raise ValueError("min_success_prob must lie in (0, 1)")
        if not 0.0 < self.max_success_prob <= 1.0:
            raise ValueError("max_success_prob must lie in (0, 1]")
        if self.min_success_prob >= self.max_success_prob:
            raise ValueError("min_success_prob must be strictly less than max_success_prob")
        if self.min_reward <= 0 or self.max_reward <= 0:
            raise ValueError("rewards must be strictly positive")
        if self.min_cost <= 0 or self.max_cost <= 0:
            raise ValueError("costs must be strictly positive")


@dataclass
class PlannerObservation:
    """Structured observation returned to planning components."""

    vector: np.ndarray
    legal_actions: List[int]
    action_metadata: Dict[int, Dict[str, float]]
    budget_remaining: float
    timestep: int

    def __iter__(self):
        yield self.vector
        yield self.legal_actions
        yield self.action_metadata
        yield self.budget_remaining
        yield self.timestep


@dataclass
class StepResult:
    """Container describing the outcome of a single environment step."""

    observation: PlannerObservation
    reward: float
    done: bool
    info: Dict[str, float] = field(default_factory=dict)

    def __iter__(self):
        yield self.observation
        yield self.reward
        yield self.done
        yield self.info


def vector_size(config: EnvironmentConfig) -> int:
    """Return the flattened observation size for ``config``."""

    return FEATURES_PER_JOB * config.max_jobs + GLOBAL_FEATURES


class AGIJobsPlanningEnv:
    """Stochastic economic environment used by the demo planner."""

    skip_action: int

    def __init__(self, config: EnvironmentConfig) -> None:
        self.config = config
        self._rng = np.random.default_rng(config.rng_seed)
        self.skip_action = config.max_jobs
        self.reset()

    # ------------------------------------------------------------------
    # Environment lifecycle
    # ------------------------------------------------------------------
    def reset(self) -> PlannerObservation:
        """Reset the environment state and return the initial observation."""

        self._timestep = 0
        self._budget = float(self.config.starting_budget)
        self._history: List[Dict[str, float]] = []
        self._jobs = [self._generate_job() for _ in range(self.config.max_jobs)]
        return self._make_observation()

    def seed(self, seed: int) -> None:
        """Re-seed the underlying pseudo random generator."""

        self._rng = np.random.default_rng(seed)

    def observe(self) -> PlannerObservation:
        """Return the latest observation without advancing the environment."""

        return self._make_observation()

    # ------------------------------------------------------------------
    # Core dynamics
    # ------------------------------------------------------------------
    def step(self, action: int) -> StepResult:
        """Apply ``action`` and return the resulting transition."""

        if self.done:
            raise RuntimeError("Cannot act on a finished episode")
        if action not in self._legal_actions():
            raise ValueError(f"Action {action} is not available")

        info: Dict[str, float] = {"timestep": float(self._timestep)}
        reward = 0.0
        success = False

        if action == self.skip_action:
            info["skipped"] = 1.0
        else:
            job = self._jobs[action]
            cost = job["cost"]
            payout = job["reward"]
            success_probability = job["success_probability"]
            affordable = self._budget >= cost
            info.update({
                "cost": cost,
                "payout": payout,
                "success_probability": success_probability,
            })
            if not affordable:
                info["affordable"] = 0.0
            spend = min(cost, self._budget)
            self._budget -= spend
            success = bool(self._rng.random() < success_probability and affordable)
            if success:
                reward = payout - cost
                self._budget += payout
            else:
                reward = -cost
            info.update({
                "success": 1.0 if success else 0.0,
                "net_reward": reward,
            })
            self._jobs[action] = self._generate_job()

        self._timestep += 1
        self._history.append({"reward": reward, "success": 1.0 if success else 0.0, "budget": self._budget})
        observation = self._make_observation()
        done = self.done
        info["remaining_budget"] = self._budget
        info["done"] = 1.0 if done else 0.0
        return StepResult(observation=observation, reward=float(reward), done=done, info=info)

    # ------------------------------------------------------------------
    # Introspection helpers
    # ------------------------------------------------------------------
    def summarize_history(self) -> Dict[str, float]:
        """Aggregate key metrics from the executed episode."""

        total_reward = float(sum(step["reward"] for step in self._history))
        successes = float(sum(step["success"] for step in self._history))
        return {
            "total_reward": total_reward,
            "successful_trials": successes,
            "remaining_budget": float(self._budget),
            "steps": float(self._timestep),
        }

    @property
    def done(self) -> bool:
        return self._timestep >= self.config.horizon or self._budget <= 0.0

    @property
    def num_actions(self) -> int:
        return self.config.max_jobs + 1

    # ------------------------------------------------------------------
    # Internal utilities
    # ------------------------------------------------------------------
    def _generate_job(self) -> Dict[str, float]:
        reward = float(self._rng.uniform(self.config.min_reward, self.config.max_reward))
        max_cost = min(self.config.max_cost, reward)
        cost = float(self._rng.uniform(self.config.min_cost, max_cost))
        success_probability = float(self._rng.uniform(self.config.min_success_prob, self.config.max_success_prob))
        duration = int(self._rng.integers(1, max(2, self.config.horizon // 2 + 1)))
        return {
            "reward": reward,
            "cost": cost,
            "success_probability": success_probability,
            "duration": float(duration),
        }

    def _legal_actions(self) -> List[int]:
        return list(range(self.config.max_jobs)) + [self.skip_action]

    def _make_observation(self) -> PlannerObservation:
        features: List[float] = []
        metadata: Dict[int, Dict[str, float]] = {}
        for index, job in enumerate(self._jobs):
            reward = job["reward"]
            cost = job["cost"]
            success_probability = job["success_probability"]
            expected_value = success_probability * (reward - cost) - (1.0 - success_probability) * cost
            duration = job["duration"]
            features.extend(
                [
                    reward / self.config.max_reward,
                    cost / max(self.config.max_cost, 1.0),
                    success_probability,
                    expected_value / self.config.max_reward,
                    duration / max(self.config.horizon, 1),
                ]
            )
            metadata[index] = {
                "reward": reward,
                "cost": cost,
                "success_probability": success_probability,
                "expected_value": expected_value,
                "duration": duration,
                "affordable": 1.0 if self._budget >= cost else 0.0,
            }

        features.append(self._budget / self.config.starting_budget)
        features.append((self.config.horizon - self._timestep) / max(self.config.horizon, 1))
        vector = np.array(features, dtype=np.float32)
        legal_actions = self._legal_actions()
        metadata[self.skip_action] = {"reward": 0.0, "cost": 0.0, "success_probability": 0.0, "expected_value": 0.0, "duration": 0.0}
        return PlannerObservation(
            vector=vector,
            legal_actions=legal_actions,
            action_metadata=metadata,
            budget_remaining=float(self._budget),
            timestep=self._timestep,
        )


JobsEnvironment = AGIJobsPlanningEnv


__all__ = [
    "AGIJobsPlanningEnv",
    "EnvironmentConfig",
    "JobsEnvironment",
    "PlannerObservation",
    "StepResult",
    "vector_size",
]
