"""Utility dataclasses capturing aggregated run metrics for the demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class RunMetrics:
    total_cost: float = 0.0
    total_gmv: float = 0.0
    total_successes: int = 0
    total_failures: int = 0
    evaluations_completed: int = 0
    expansions_completed: int = 0
    agent_failures: Dict[str, int] = field(default_factory=dict)

    def record_evaluation(self, agent_id: str, success: bool, *, gmv: float, cost: float) -> None:
        self.total_cost += cost
        self.evaluations_completed += 1
        if success:
            self.total_gmv += gmv
            self.total_successes += 1
        else:
            self.total_failures += 1
            self.agent_failures[agent_id] = self.agent_failures.get(agent_id, 0) + 1

    def record_expansion(self) -> None:
        self.expansions_completed += 1

    @property
    def profit(self) -> float:
        return self.total_gmv - self.total_cost

    @property
    def roi(self) -> float:
        if self.total_cost <= 0:
            return float("inf")
        return self.total_gmv / self.total_cost

    @property
    def total_actions(self) -> int:
        return self.evaluations_completed + self.expansions_completed

    def reset_agent_failure(self, agent_id: str) -> None:
        if agent_id in self.agent_failures:
            del self.agent_failures[agent_id]


__all__ = ["RunMetrics"]
