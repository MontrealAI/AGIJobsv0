"""Core entities used by the Huxley–Gödel Machine demo."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(slots=True)
class AgentNode:
    """Represents an agent in the lineage tree."""

    identifier: str
    parent_id: Optional[str]
    depth: int
    label: str
    description: str
    quality: float
    successes: int = 0
    failures: int = 0
    clade_successes: int = 0
    clade_failures: int = 0
    is_pruned: bool = False
    notes: List[str] = field(default_factory=list)

    def record_result(self, success: bool) -> None:
        if success:
            self.successes += 1
            self.clade_successes += 1
        else:
            self.failures += 1
            self.clade_failures += 1

    def record_clade_result(self, success: bool) -> None:
        if success:
            self.clade_successes += 1
        else:
            self.clade_failures += 1

    @property
    def attempts(self) -> int:
        return self.successes + self.failures

    @property
    def clade_attempts(self) -> int:
        return self.clade_successes + self.clade_failures

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts


@dataclass(slots=True)
class DemoSnapshot:
    """Snapshot of demo metrics for reporting."""

    iteration: int
    active_agents: int
    total_expansions: int
    total_evaluations: int
    gmv: float
    cost: float
    roi: float
    best_agent_id: str


@dataclass(slots=True)
class RunLedger:
    """Accumulates economic data during a run."""

    gmv: float = 0.0
    cost: float = 0.0
    total_successes: int = 0
    total_failures: int = 0
    history: List[DemoSnapshot] = field(default_factory=list)
    agent_history: Dict[int, Dict[str, float]] = field(default_factory=dict)

    def register(self, success: bool, revenue: float, expense: float) -> None:
        self.cost += expense
        if success:
            self.gmv += revenue
            self.total_successes += 1
        else:
            self.total_failures += 1

    @property
    def roi(self) -> float:
        if self.cost <= 0:
            return float("inf")
        return self.gmv / self.cost


__all__ = [
    "AgentNode",
    "DemoSnapshot",
    "RunLedger",
]
