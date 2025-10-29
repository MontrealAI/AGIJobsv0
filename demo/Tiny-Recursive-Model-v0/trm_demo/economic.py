"""Economic ledger for Tiny Recursive Model ROI tracking."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class LedgerEntry:
    """Single economic event captured by the ledger."""

    value: float
    cost: float
    success: bool
    metadata: Dict[str, float] = field(default_factory=dict)

    @property
    def roi(self) -> float:
        if self.cost == 0:
            return float("inf") if self.success else 0.0
        return (self.value - self.cost) / self.cost


@dataclass
class EconomicLedger:
    """High-signal ROI tracker for TRM powered actions."""

    entries: List[LedgerEntry] = field(default_factory=list)

    def record_success(self, *, value: float, cost: float, metadata: Dict[str, float] | None = None) -> None:
        self.entries.append(LedgerEntry(value=value, cost=cost, success=True, metadata=metadata or {}))

    def record_failure(self, *, cost: float, metadata: Dict[str, float] | None = None) -> None:
        self.entries.append(LedgerEntry(value=0.0, cost=cost, success=False, metadata=metadata or {}))

    @property
    def total_value(self) -> float:
        return sum(entry.value for entry in self.entries)

    @property
    def total_cost(self) -> float:
        return sum(entry.cost for entry in self.entries)

    @property
    def roi(self) -> float:
        total_cost = self.total_cost
        if total_cost == 0:
            return float("inf") if self.entries else 0.0
        return (self.total_value - total_cost) / total_cost

    @property
    def success_rate(self) -> float:
        if not self.entries:
            return 0.0
        return sum(1 for entry in self.entries if entry.success) / len(self.entries)

    def window(self, size: int) -> "EconomicLedger":
        return EconomicLedger(entries=self.entries[-size:])

    def to_dict(self) -> Dict[str, float]:
        return {
            "total_events": float(len(self.entries)),
            "success_rate": self.success_rate,
            "roi": self.roi,
            "total_value": self.total_value,
            "total_cost": self.total_cost,
        }

