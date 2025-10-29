"""Economic ledger for TRM demo."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import List

from .utils import quantize


@dataclass
class LedgerEntry:
    timestamp: float
    value: float
    cost: float
    success: bool
    cycles_used: int
    latency_ms: float


@dataclass
class EconomicLedger:
    """Tracks TRM economic performance."""

    value_per_success: float
    base_compute_cost: float
    cost_per_cycle: float
    daily_budget: float
    entries: List[LedgerEntry] = field(default_factory=list)

    def record_success(self, *, cost: float, cycles_used: int, latency_ms: float) -> LedgerEntry:
        entry = LedgerEntry(
            timestamp=time.time(),
            value=self.value_per_success,
            cost=cost,
            success=True,
            cycles_used=cycles_used,
            latency_ms=latency_ms,
        )
        self.entries.append(entry)
        return entry

    def record_failure(self, *, cost: float, cycles_used: int, latency_ms: float) -> LedgerEntry:
        entry = LedgerEntry(
            timestamp=time.time(),
            value=0.0,
            cost=cost,
            success=False,
            cycles_used=cycles_used,
            latency_ms=latency_ms,
        )
        self.entries.append(entry)
        return entry

    @property
    def total_value(self) -> float:
        return quantize(sum(entry.value for entry in self.entries))

    @property
    def total_cost(self) -> float:
        return quantize(sum(entry.cost for entry in self.entries))

    @property
    def roi(self) -> float:
        cost = self.total_cost
        if cost == 0:
            return float("inf") if self.total_value > 0 else 0.0
        return quantize(self.total_value / cost)

    def compute_cost(self, cycles: int) -> float:
        """Estimate compute cost for cycles."""

        return quantize(self.base_compute_cost + self.cost_per_cycle * cycles, precision=6)

    def recent_roi(self, window: int) -> float:
        recent = self.entries[-window:]
        if not recent:
            return 0.0
        value = sum(entry.value for entry in recent)
        cost = sum(entry.cost for entry in recent)
        if cost == 0:
            return float("inf")
        return quantize(value / cost)

    def total_cycles(self) -> int:
        return sum(entry.cycles_used for entry in self.entries)

    def total_latency_ms(self) -> float:
        return sum(entry.latency_ms for entry in self.entries)


__all__ = ["EconomicLedger", "LedgerEntry"]
