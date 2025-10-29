"""Economic ledger and ROI analytics for the Tiny Recursive Model demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .config import EconomicsConfig


@dataclass
class LedgerEntry:
    outcome: bool
    value: float
    cost: float
    steps_used: int
    latency_ms: float

    @property
    def roi(self) -> float:
        if self.cost == 0:
            return float("inf")
        return self.value / self.cost


@dataclass
class EconomicLedger:
    config: EconomicsConfig
    entries: List[LedgerEntry] = field(default_factory=list)

    def record_success(self, cost: float, value: Optional[float] = None, steps_used: int = 0, latency_ms: float = 0.0) -> LedgerEntry:
        value = value if value is not None else self.config.value_per_success
        entry = LedgerEntry(outcome=True, value=value, cost=cost, steps_used=steps_used, latency_ms=latency_ms)
        self.entries.append(entry)
        return entry

    def record_failure(self, cost: float, steps_used: int = 0, latency_ms: float = 0.0) -> LedgerEntry:
        entry = LedgerEntry(outcome=False, value=0.0, cost=cost, steps_used=steps_used, latency_ms=latency_ms)
        self.entries.append(entry)
        return entry

    @property
    def total_cost(self) -> float:
        return sum(entry.cost for entry in self.entries)

    @property
    def total_value(self) -> float:
        return sum(entry.value for entry in self.entries)

    @property
    def roi(self) -> float:
        if self.total_cost == 0:
            return float("inf")
        return self.total_value / self.total_cost

    def recent_roi(self, window: int) -> float:
        if not self.entries:
            return 0.0
        subset = self.entries[-window:]
        cost = sum(entry.cost for entry in subset)
        if cost == 0:
            return float("inf")
        value = sum(entry.value for entry in subset)
        return value / cost

    def success_rate(self, window: Optional[int] = None) -> float:
        data = self.entries if window is None else self.entries[-window:]
        if not data:
            return 0.0
        return sum(1 for entry in data if entry.outcome) / len(data)

    def to_dict(self) -> Dict[str, float]:
        return {
            "total_cost": self.total_cost,
            "total_value": self.total_value,
            "roi": self.roi,
            "success_rate": self.success_rate(),
            "entries": [entry.__dict__ for entry in self.entries],
        }

    def reset(self) -> None:
        self.entries.clear()

    def enforce_daily_cap(self) -> bool:
        return self.total_cost >= self.config.daily_cost_cap
