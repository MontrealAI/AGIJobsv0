"""Sentinel guardrails for TRM operations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import SentinelSettings
from .ledger import EconomicLedger


@dataclass
class SentinelStatus:
    halted: bool
    reason: Optional[str] = None


class Sentinel:
    """Simple guardrail implementation enforcing ROI and latency caps."""

    def __init__(self, settings: SentinelSettings) -> None:
        self.settings = settings
        self.consecutive_failures = 0

    def evaluate(
        self,
        *,
        ledger: EconomicLedger,
        last_latency_ms: float,
        last_steps: int,
        last_success: bool,
    ) -> SentinelStatus:
        totals = ledger.totals
        if totals["total_cost"] > 0 and totals["roi"] < self.settings.min_roi:
            return SentinelStatus(True, "ROI floor breached")
        if ledger.cost_this_run() > self.settings.max_daily_cost:
            return SentinelStatus(True, "Cost budget exhausted")
        if last_latency_ms > self.settings.max_latency_ms:
            return SentinelStatus(True, "Latency threshold exceeded")
        if last_steps > self.settings.max_recursions:
            return SentinelStatus(True, "Recursion depth exceeded")

        if not last_success:
            self.consecutive_failures += 1
            if self.consecutive_failures >= self.settings.max_consecutive_failures:
                return SentinelStatus(True, "Too many consecutive failures")
        else:
            self.consecutive_failures = 0

        return SentinelStatus(False, None)


__all__ = ["Sentinel", "SentinelStatus"]
