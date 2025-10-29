"""Baseline simulator for comparison with the HGM-driven process."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List
import random

from .metrics import RunSummary


@dataclass
class BaselineAgent:
    quality: float
    successes: int = 0
    failures: int = 0

    @property
    def attempts(self) -> int:
        return self.successes + self.failures

    @property
    def score(self) -> float:
        if self.attempts == 0:
            return 0.5
        return self.successes / self.attempts


class GreedyBaselineSimulator:
    """A simple greedy policy that lacks CMP awareness."""

    def __init__(
        self,
        rng: random.Random,
        root_quality: float,
        mutation_std: float,
        success_value: float,
        evaluation_cost: float,
        expansion_cost: float,
        total_steps: int,
        quality_bounds: tuple[float, float],
    ) -> None:
        self.rng = rng
        self.mutation_std = mutation_std
        self.success_value = success_value
        self.evaluation_cost = evaluation_cost
        self.expansion_cost = expansion_cost
        self.total_steps = total_steps
        self.quality_bounds = quality_bounds
        self.agents: List[BaselineAgent] = [BaselineAgent(root_quality)]
        self.gmv = 0.0
        self.cost = 0.0
        self.successes = 0
        self.failures = 0

    def run(self) -> RunSummary:
        for step in range(1, self.total_steps + 1):
            if step % 6 == 0:
                self._expand_best()
            agent = self._select_agent()
            self._evaluate(agent)
        roi = self._compute_roi()
        profit = self.gmv - self.cost
        return RunSummary(
            strategy="Greedy Baseline",
            gmv=self.gmv,
            cost=self.cost,
            successes=self.successes,
            failures=self.failures,
            roi=roi,
            profit=profit,
            steps=self.total_steps,
        )

    def _expand_best(self) -> None:
        best_agent = max(self.agents, key=lambda agent: agent.score)
        new_quality = best_agent.quality + self.rng.gauss(0, self.mutation_std)
        low, high = self.quality_bounds
        bounded = max(low, min(high, new_quality))
        self.agents.append(BaselineAgent(bounded))
        self.cost += self.expansion_cost

    def _select_agent(self) -> BaselineAgent:
        # Greedy selection purely on empirical success rate.
        return max(self.agents, key=lambda agent: agent.score)

    def _evaluate(self, agent: BaselineAgent) -> None:
        success = self.rng.random() < agent.quality
        self.cost += self.evaluation_cost
        if success:
            agent.successes += 1
            self.successes += 1
            self.gmv += self.success_value
        else:
            agent.failures += 1
            self.failures += 1

    def _compute_roi(self) -> float:
        if self.cost <= 0:
            return float("inf")
        return self.gmv / self.cost


__all__ = ["GreedyBaselineSimulator"]
