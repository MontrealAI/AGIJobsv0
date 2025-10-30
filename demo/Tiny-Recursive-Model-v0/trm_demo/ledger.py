"""Economic ledger and ROI accounting utilities."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class LedgerEntry:
    """Single record of a TRM-enabled operation."""

    cost: float
    value: float
    success: bool
    steps_used: int
    halted_early: bool
    latency_ms: float


@dataclass
class EconomicLedger:
    """Track costs, value, and ROI of TRM activity."""

    default_success_value: float
    base_cost_per_call: float
    cost_per_inner_step: float
    cost_per_outer_step: float
    entries: List[LedgerEntry] = field(default_factory=list)
    daily_cost_budget: float | None = None

    def record_success(
        self,
        *,
        value: float | None = None,
        cost: float | None = None,
        steps_used: int = 0,
        halted_early: bool = False,
        latency_ms: float = 0.0,
    ) -> LedgerEntry:
        """Log a successful transaction."""
        resolved_value = self.default_success_value if value is None else value
        entry = LedgerEntry(
            cost=self._resolve_cost(cost, steps_used),
            value=resolved_value,
            success=True,
            steps_used=steps_used,
            halted_early=halted_early,
            latency_ms=latency_ms,
        )
        self.entries.append(entry)
        return entry

    def record_failure(
        self,
        *,
        cost: float | None = None,
        steps_used: int = 0,
        halted_early: bool = False,
        latency_ms: float = 0.0,
    ) -> LedgerEntry:
        """Log a failed transaction."""
        entry = LedgerEntry(
            cost=self._resolve_cost(cost, steps_used),
            value=0.0,
            success=False,
            steps_used=steps_used,
            halted_early=halted_early,
            latency_ms=latency_ms,
        )
        self.entries.append(entry)
        return entry

    def _resolve_cost(self, cost: float | None, steps_used: int) -> float:
        if cost is not None:
            return cost
        inner_steps = max(steps_used - 1, 0)
        return (
            self.base_cost_per_call
            + inner_steps * self.cost_per_inner_step
            + self.cost_per_outer_step
        )

    @property
    def totals(self) -> Dict[str, float]:
        """Aggregate ledger totals."""
        total_cost = sum(entry.cost for entry in self.entries)
        total_value = sum(entry.value for entry in self.entries)
        success_count = sum(1 for entry in self.entries if entry.success)
        failure_count = len(self.entries) - success_count
        roi = (total_value / total_cost) if total_cost else float("inf")
        return {
            "total_cost": total_cost,
            "total_value": total_value,
            "roi": roi,
            "successes": success_count,
            "failures": failure_count,
        }

    def average_latency(self) -> float:
        if not self.entries:
            return 0.0
        return sum(entry.latency_ms for entry in self.entries) / len(self.entries)

    def cost_this_run(self) -> float:
        return sum(entry.cost for entry in self.entries)


__all__ = ["EconomicLedger", "LedgerEntry"]
