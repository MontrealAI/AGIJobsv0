from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict


@dataclass(slots=True)
class PlannerDecision:
    job_id: str
    strategy: str
    expected_reward: float
    confidence: float


class MuZeroPlanner:
    """Simplified MuZero-inspired planner.

    The planner evaluates candidate strategies for each job using a Monte Carlo
    tree search with a configurable number of simulations. The demo keeps the
    environment model lightweight while surfacing the same explainability
    signals (expected reward, confidence) a production planner would expose.
    """

    def __init__(self, search_depth: int, simulations: int, exploration_constant: float) -> None:
        self.search_depth = search_depth
        self.simulations = simulations
        self.exploration_constant = exploration_constant

    def plan(self, job_id: str, reward_estimates: Dict[str, float]) -> PlannerDecision:
        if not reward_estimates:
            raise ValueError("No strategies to evaluate")
        priors = {strategy: 1.0 / len(reward_estimates) for strategy in reward_estimates}
        value_sums = {strategy: 0.0 for strategy in reward_estimates}
        visit_counts = {strategy: 0 for strategy in reward_estimates}

        for _ in range(self.simulations):
            strategy = self._select_strategy(priors, value_sums, visit_counts)
            rollout_value = self._simulate(strategy, reward_estimates[strategy])
            visit_counts[strategy] += 1
            value_sums[strategy] += rollout_value

        best_strategy = max(value_sums, key=lambda key: value_sums[key] / max(visit_counts[key], 1))
        avg_reward = value_sums[best_strategy] / max(visit_counts[best_strategy], 1)
        confidence = min(1.0, visit_counts[best_strategy] / self.simulations)
        return PlannerDecision(job_id=job_id, strategy=best_strategy, expected_reward=avg_reward, confidence=confidence)

    def _select_strategy(
        self,
        priors: Dict[str, float],
        value_sums: Dict[str, float],
        visit_counts: Dict[str, int],
    ) -> str:
        total_visits = sum(visit_counts.values())
        best_score = float("-inf")
        best_strategy = next(iter(priors))
        for strategy, prior in priors.items():
            count = visit_counts[strategy]
            value = value_sums[strategy] / (count + 1e-9)
            exploration_term = self.exploration_constant * prior * math.sqrt(total_visits + 1) / (1 + count)
            score = value + exploration_term
            if score > best_score:
                best_score = score
                best_strategy = strategy
        return best_strategy

    def _simulate(self, strategy: str, base_reward: float) -> float:
        value = base_reward
        for _ in range(self.search_depth):
            noise = random.uniform(-0.1, 0.1) * base_reward
            value = value + noise
        return max(value, 0.0)


__all__ = ["MuZeroPlanner", "PlannerDecision"]
