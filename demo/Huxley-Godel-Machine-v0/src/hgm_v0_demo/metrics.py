"""Shared metrics models for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class EconomicSnapshot:
    step: int
    gmv: float
    cost: float
    successes: int
    failures: int
    roi: float
    agents: List["AgentSnapshot"]
    best_agent_id: Optional[str]


@dataclass
class RunSummary:
    strategy: str
    gmv: float
    cost: float
    successes: int
    failures: int
    roi: float
    profit: float
    steps: int
    best_agent_id: Optional[str] = None
    best_agent_quality: Optional[float] = None


@dataclass
class AgentSnapshot:
    agent_id: str
    parent_id: Optional[str]
    depth: int
    quality: float
    status: str
    direct_success: int
    direct_failure: int
    clade_success: int
    clade_failure: int
    inflight_expansions: int
    inflight_evaluations: int


@dataclass
class Timeline:
    snapshots: List[EconomicSnapshot]

    def append(self, snapshot: EconomicSnapshot) -> None:
        self.snapshots.append(snapshot)

    @property
    def last(self) -> EconomicSnapshot:
        return self.snapshots[-1]


__all__ = ["AgentSnapshot", "EconomicSnapshot", "RunSummary", "Timeline"]
