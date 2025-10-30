"""Economic job environment for MuZero demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple
import math
import random


@dataclass
class JobOpportunity:
    """Representation of a single job opportunity."""

    gmv: float
    cost: float
    success_prob: float
    duration: int

    def expected_utility(self) -> float:
        success_gain = self.gmv - self.cost
        failure_loss = self.cost
        return self.success_prob * success_gain - (1.0 - self.success_prob) * failure_loss


class JobsEnvironment:
    """Stochastic environment modelling AGI Jobs economic decisions."""

    def __init__(self, config: Dict):
        self.config = config
        self.random = random.Random()
        env_conf = config.get("environment", {})
        self.episode_length = int(env_conf.get("episode_length", 6))
        self.job_pool_size = int(env_conf.get("job_pool_size", 5))
        self.success_noise = float(env_conf.get("success_noise", 0.05))
        self.discount = float(env_conf.get("discount", 0.997))
        self.max_budget = float(env_conf.get("max_budget", 10000.0))
        self.stochastic_fail_penalty = float(env_conf.get("stochastic_fail_penalty", 0.2))
        owner_conf = config.get("owner", {})
        self.max_capital_per_action = float(owner_conf.get("max_capital_per_action", self.max_budget))
        self.reset()

    def seed(self, seed: int) -> None:
        self.random.seed(seed)

    def reset(self) -> List[JobOpportunity]:
        self.timestep = 0
        self.budget_spent = 0.0
        self._jobs = [self._generate_job() for _ in range(self.job_pool_size)]
        self._last_observation = self._encode_observation()
        self._last_reward = 0.0
        self._done = False
        return self._jobs

    def _generate_job(self) -> JobOpportunity:
        gmv = self.random.uniform(500.0, 5000.0)
        cost = self.random.uniform(100.0, min(gmv * 0.8, 2500.0))
        success_prob = self.random.uniform(0.2, 0.95)
        duration = self.random.randint(1, 3)
        return JobOpportunity(gmv=gmv, cost=cost, success_prob=success_prob, duration=duration)

    def observe(self) -> List[float]:
        self._last_observation = self._encode_observation()
        return self._last_observation

    def _encode_observation(self) -> List[float]:
        features: List[float] = []
        max_gmv = 5000.0
        max_cost = 2500.0
        for job in self._jobs:
            expected = job.expected_utility()
            features.extend(
                [
                    job.gmv / max_gmv,
                    job.cost / max_cost,
                    job.success_prob,
                    expected / max_gmv,
                    job.duration / 5.0,
                ]
            )
        remaining_slots = self.episode_length - self.timestep
        features.append(self.budget_spent / max(self.max_budget, 1.0))
        features.append(remaining_slots / max(self.episode_length, 1))
        return features

    @property
    def num_actions(self) -> int:
        return self.job_pool_size

    def step(self, action: int) -> Tuple[List[float], float, bool, Dict[str, float]]:
        if self._done:
            raise RuntimeError("Episode already completed")
        if action < 0 or action >= self.job_pool_size:
            raise ValueError(f"Action {action} outside range 0..{self.job_pool_size - 1}")
        job = self._jobs[action]
        if job.cost > self.max_capital_per_action:
            reward = -abs(job.cost) * (1.0 + self.stochastic_fail_penalty)
            info = {
                "violation": 1.0,
                "reason": "max_capital",
                "projected_value": reward,
            }
            self._last_reward = reward
            self._done = True
            return self.observe(), reward, True, info

        noise = self.random.uniform(-self.success_noise, self.success_noise)
        success_chance = max(0.0, min(1.0, job.success_prob + noise))
        success = self.random.random() < success_chance
        reward = job.gmv - job.cost if success else -job.cost * (1.0 + self.stochastic_fail_penalty)
        self.budget_spent += job.cost
        self.timestep += 1
        self._jobs[action] = self._generate_job()
        self._last_reward = reward
        self._done = self.timestep >= self.episode_length or self.budget_spent >= self.max_budget
        info = {
            "success": float(success),
            "success_chance": success_chance,
            "gmv": job.gmv,
            "cost": job.cost,
            "reward": reward,
        }
        return self.observe(), reward, self._done, info

    def rollout_value(self) -> float:
        remaining = self.episode_length - self.timestep
        if remaining <= 0:
            return 0.0
        expected_jobs = [job.expected_utility() for job in self._jobs]
        return sum(expected_jobs[: min(remaining, len(expected_jobs))]) * math.pow(self.discount, self.timestep)

    @property
    def last_observation(self) -> List[float]:
        return self._last_observation

    @property
    def last_reward(self) -> float:
        return self._last_reward

    @property
    def done(self) -> bool:
        return self._done
