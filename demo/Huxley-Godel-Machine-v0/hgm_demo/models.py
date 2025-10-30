"""Data models for the Huxley–Gödel Machine demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(slots=True)
class AgentStats:
    """Performance counters maintained for every agent."""

    successes: int = 0
    failures: int = 0
    clade_successes: int = 0
    clade_failures: int = 0

    def total(self) -> int:
        return self.successes + self.failures

    def clade_total(self) -> int:
        return self.clade_successes + self.clade_failures

    def record(self, success: bool) -> None:
        if success:
            self.successes += 1
        else:
            self.failures += 1

    def record_clade(self, success: bool) -> None:
        if success:
            self.clade_successes += 1
        else:
            self.clade_failures += 1


@dataclass(slots=True)
class AgentNode:
    """Represents a single agent in the lineage tree."""

    identifier: str
    parent_id: Optional[str]
    generation: int
    stats: AgentStats = field(default_factory=AgentStats)
    metadata: Dict[str, float] = field(default_factory=dict)
    children: List[str] = field(default_factory=list)
    busy: bool = False
    pruned: bool = False

    def mark_busy(self, value: bool) -> None:
        self.busy = value

