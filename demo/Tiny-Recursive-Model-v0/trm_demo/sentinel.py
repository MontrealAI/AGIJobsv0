"""Safety guardrails for TRM economic operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .ledger import EconomicLedger


@dataclass(slots=True)
class SentinelSettings:
    min_roi: float = 1.2
    max_daily_cost: float = 50.0
    max_latency_ms: float = 2000.0
    max_steps: int = 18


class Sentinel:
    """Implements ROI, cost and latency guardrails for TRM operations."""

    def __init__(self, settings: Optional[SentinelSettings] = None) -> None:
        self.settings = settings or SentinelSettings()
        self.daily_cost_spent: float = 0.0
        self.halt_requested: bool = False
        self.consecutive_low_roi: int = 0
        self.max_low_roi_events: int = 15

    def reset_period(self) -> None:
        self.daily_cost_spent = 0.0
        self.halt_requested = False
        self.consecutive_low_roi = 0

    def before_run(self) -> None:
        if self.halt_requested:
            raise RuntimeError("TRM usage halted by Sentinel guardrails")

    def after_run(self, *, cost: float, latency_ms: float, steps_used: int, roi: float) -> None:
        self.daily_cost_spent += cost
        if roi < self.settings.min_roi:
            self.consecutive_low_roi += 1
        else:
            self.consecutive_low_roi = 0
        if self.consecutive_low_roi >= self.max_low_roi_events:
            self.halt_requested = True
        if self.daily_cost_spent > self.settings.max_daily_cost:
            self.halt_requested = True
        if latency_ms > self.settings.max_latency_ms:
            self.halt_requested = True
        if steps_used > self.settings.max_steps:
            self.halt_requested = True

    def evaluate_ledger(self, ledger: EconomicLedger) -> None:
        if ledger.total_cost() > self.settings.max_daily_cost:
            self.halt_requested = True
        if ledger.rolling_roi() < self.settings.min_roi:
            self.halt_requested = True

