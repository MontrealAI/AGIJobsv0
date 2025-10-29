"""Shared metrics models for the HGM demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass
class EconomicSnapshot:
    step: int
    gmv: float
    cost: float
    successes: int
    failures: int
    roi: float


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


@dataclass
class Timeline:
    snapshots: List[EconomicSnapshot]

    def append(self, snapshot: EconomicSnapshot) -> None:
        self.snapshots.append(snapshot)

    @property
    def last(self) -> EconomicSnapshot:
        return self.snapshots[-1]


__all__ = ["EconomicSnapshot", "RunSummary", "Timeline"]
