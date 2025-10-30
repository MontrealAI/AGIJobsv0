"""Domain-specific environment abstractions for the MuZero-style demo.

The environment models a simplified AGI Jobs marketplace where a planner
selects which opportunity to pursue at each decision point.  The
observation surface is deliberately compact so it can be consumed by the
MuZero network yet expressive enough to capture economic trade-offs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
import copy
import numpy as np


@dataclass
class JobOpportunity:
    """Represents a single opportunity available to the planner."""

    identifier: str
    reward: float
    cost: float
    success_probability: float
    strategic_value: float
    execution_time: int

    def expected_utility(self) -> float:
        """Compute the expected immediate utility for the job."""

        return self.success_probability * self.reward - self.cost


@dataclass
class EnvironmentConfig:
    """Configuration knobs for the simulated AGI Jobs marketplace."""

    max_jobs: int = 6
    planning_horizon: int = 8
    starting_budget: float = 150.0
    discount: float = 0.997
    skip_penalty: float = -0.5
    risk_aversion: float = 0.15
    rng_seed: Optional[int] = None


@dataclass
class PlannerObservation:
    """Observation emitted to the MuZero network."""

    vector: np.ndarray
    legal_actions: List[int]
    action_metadata: Dict[int, Dict[str, float]]
    step_index: int
    budget_remaining: float


@dataclass
class PlannerStepResult:
    observation: PlannerObservation
    reward: float
    done: bool
    info: Dict[str, float]


@dataclass
class PlannerAction:
    index: int
    job: Optional[JobOpportunity]
    label: str


class AGIJobsPlanningEnv:
    """A lightweight economic simulator for MuZero self-play."""

    def __init__(self, config: EnvironmentConfig) -> None:
        self.config = config
        self._rng = np.random.default_rng(config.rng_seed)
        self._jobs: List[JobOpportunity] = []
        self._step = 0
        self._budget: float = config.starting_budget
        self._history: List[Dict[str, float]] = []

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------
    def reset(self) -> PlannerObservation:
        """Reset the simulator to an initial randomly sampled state."""

        self._rng = np.random.default_rng(self.config.rng_seed)
        self._jobs = [self._sample_job(i) for i in range(self.config.max_jobs)]
        self._step = 0
        self._budget = self.config.starting_budget
        self._history.clear()
        return self._build_observation()

    def clone(self) -> "AGIJobsPlanningEnv":
        """Create a deep copy used for lookahead search."""

        return copy.deepcopy(self)

    # ------------------------------------------------------------------
    # Core simulation logic
    # ------------------------------------------------------------------
    def legal_actions(self) -> List[PlannerAction]:
        actions: List[PlannerAction] = []
        for idx, job in enumerate(self._jobs):
            if job.cost <= self._budget:
                actions.append(PlannerAction(index=idx, job=job, label=f"commit:{job.identifier}"))
        actions.append(PlannerAction(index=len(self._jobs), job=None, label="skip"))
        return actions

    def step(self, action_index: int) -> PlannerStepResult:
        actions = self.legal_actions()
        if not any(a.index == action_index for a in actions):
            raise ValueError(f"Illegal action index {action_index} for current state")

        chosen = next(a for a in actions if a.index == action_index)
        info: Dict[str, float] = {"step": float(self._step)}
        utility_reward = 0.0

        if chosen.job is None:
            utility_reward = self.config.skip_penalty
            info["action"] = -1
        else:
            job = chosen.job
            success = self._rng.random() < job.success_probability
            realized_reward = job.reward if success else 0.0
            utility_reward = realized_reward - job.cost - self.config.risk_aversion * job.strategic_value
            self._budget -= job.cost
            info.update(
                {
                    "action": float(action_index),
                    "job_reward": realized_reward,
                    "job_cost": job.cost,
                    "job_success_prob": job.success_probability,
                    "job_strategic_value": job.strategic_value,
                    "job_succeeded": 1.0 if success else 0.0,
                }
            )
            self._jobs.pop(action_index)
            # Replace consumed job with a new one to maintain opportunity flow.
            self._jobs.append(self._sample_job(len(self._jobs)))

        self._step += 1
        done = self._step >= self.config.planning_horizon or self._budget <= 0
        discount_factor = self.config.discount ** self._step
        discounted_reward = utility_reward * discount_factor
        self._history.append({"reward": utility_reward, "discounted_reward": discounted_reward, "budget": self._budget})

        observation = self._build_observation()
        return PlannerStepResult(observation=observation, reward=utility_reward, done=done, info=info)

    # ------------------------------------------------------------------
    # Observation encoding
    # ------------------------------------------------------------------
    def _build_observation(self) -> PlannerObservation:
        legal = self.legal_actions()
        max_jobs = self.config.max_jobs
        feature_length = 5
        obs = np.zeros(2 + max_jobs * feature_length, dtype=np.float32)
        obs[0] = self._budget / (self.config.starting_budget + 1e-6)
        obs[1] = self._step / (self.config.planning_horizon + 1e-6)
        metadata: Dict[int, Dict[str, float]] = {}
        for idx, job in enumerate(self._jobs[:max_jobs]):
            base = 2 + idx * feature_length
            obs[base] = job.reward / 200.0
            obs[base + 1] = job.cost / 200.0
            obs[base + 2] = job.success_probability
            obs[base + 3] = job.strategic_value / 100.0
            obs[base + 4] = 1.0 if job.cost <= self._budget else 0.0
            metadata[idx] = {
                "reward": job.reward,
                "cost": job.cost,
                "success_probability": job.success_probability,
                "strategic_value": job.strategic_value,
            }
        metadata[len(self._jobs)] = {"skip": 1.0}
        legal_indices = [action.index for action in legal]
        return PlannerObservation(vector=obs, legal_actions=legal_indices, action_metadata=metadata, step_index=self._step, budget_remaining=self._budget)

    # ------------------------------------------------------------------
    # Job sampling helpers
    # ------------------------------------------------------------------
    def _sample_job(self, index: int) -> JobOpportunity:
        reward = float(self._rng.uniform(30, 180))
        cost = float(self._rng.uniform(10, 80))
        success = float(self._rng.uniform(0.35, 0.95))
        strategic = float(self._rng.uniform(5, 60))
        execution_time = int(self._rng.integers(1, 4))
        return JobOpportunity(
            identifier=f"J{index}-{self._step}",
            reward=reward,
            cost=cost,
            success_probability=success,
            strategic_value=strategic,
            execution_time=execution_time,
        )

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------
    def summarize_history(self) -> Dict[str, float]:
        if not self._history:
            return {"total_reward": 0.0, "discounted_return": 0.0}
        total_reward = sum(step["reward"] for step in self._history)
        total_discounted = sum(step["discounted_reward"] for step in self._history)
        return {"total_reward": total_reward, "discounted_return": total_discounted, "remaining_budget": self._budget}


def vector_size(config: EnvironmentConfig) -> int:
    """Utility helper to compute observation vector length for configs."""

    return 2 + config.max_jobs * 5
