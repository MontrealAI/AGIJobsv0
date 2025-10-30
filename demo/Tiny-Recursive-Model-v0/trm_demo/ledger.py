"""Economic ledger used to track TRM value generation and spend."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Deque, Iterable, List, Optional

from collections import deque


@dataclass(slots=True)
class LedgerEntry:
    """Represents the result of a single decision or inference."""

    success: bool
    value: float
    cost: float
    steps_used: int
    halted_early: bool

    @property
    def roi(self) -> float:
        return 0.0 if self.cost == 0 else self.value / self.cost


@dataclass
class EconomicLedger:
    """Rolling ledger with ROI utilities used by the thermostat and sentinel."""

    max_entries: int = 2048
    _entries: Deque[LedgerEntry] = field(default_factory=lambda: deque(maxlen=2048))

    def record(self, entry: LedgerEntry) -> None:
        self._entries.append(entry)

    def record_success(self, value: float, cost: float, *, steps_used: int, halted_early: bool) -> None:
        self.record(LedgerEntry(True, value, cost, steps_used, halted_early))

    def record_failure(self, cost: float, *, steps_used: int, halted_early: bool, penalty: float = 0.0) -> None:
        self.record(LedgerEntry(False, penalty, cost, steps_used, halted_early))

    def entries(self) -> Iterable[LedgerEntry]:  # pragma: no cover - trivial generator
        return iter(self._entries)

    def total_value(self) -> float:
        return sum(entry.value for entry in self._entries)

    def total_cost(self) -> float:
        return sum(entry.cost for entry in self._entries)

    def roi(self) -> float:
        total_cost = self.total_cost()
        return self.total_value() / total_cost if total_cost else float("inf")

    def rolling_roi(self, window: int = 50) -> float:
        if not self._entries:
            return float("inf")
        relevant: List[LedgerEntry] = list(self._entries)[-window:]
        cost = sum(entry.cost for entry in relevant)
        return (sum(entry.value for entry in relevant) / cost) if cost else float("inf")

    def success_rate(self) -> float:
        if not self._entries:
            return 0.0
        return sum(1 for entry in self._entries if entry.success) / len(self._entries)

    def average_steps(self) -> float:
        if not self._entries:
            return 0.0
        return sum(entry.steps_used for entry in self._entries) / len(self._entries)

