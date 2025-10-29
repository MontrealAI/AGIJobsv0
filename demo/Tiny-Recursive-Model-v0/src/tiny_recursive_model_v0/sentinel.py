"""Sentinel guardrails for TRM."""

from __future__ import annotations

from dataclasses import dataclass

from .config import SentinelConfig
from .engine import InferenceTelemetry
from .ledger import EconomicLedger, LedgerEntry


@dataclass
class SentinelStatus:
    healthy: bool
    reason: str | None
    paused: bool


class Sentinel:
    """Enforces safety and economic guardrails."""

    def __init__(self, config: SentinelConfig, ledger: EconomicLedger) -> None:
        self.config = config
        self.ledger = ledger
        self.paused = False
        self.failure_streak = 0
        self.reason: str | None = None

    def reset(self) -> None:
        self.paused = False
        self.failure_streak = 0
        self.reason = None

    def force_pause(self, reason: str) -> SentinelStatus:
        self.paused = True
        self.reason = reason
        return SentinelStatus(healthy=False, reason=reason, paused=True)

    def _should_pause(self, entry: LedgerEntry, telemetry: InferenceTelemetry) -> str | None:
        if self.ledger.total_cost > self.config.max_daily_cost:
            return "Daily TRM compute budget exhausted"
        if telemetry.cycles_used > self.config.max_total_cycles:
            return "Recursion depth exceeded hard limit"
        if telemetry.steps_used * telemetry.cycles_used == 0:
            return "Model produced invalid recursion metrics"
        if telemetry.cycles_used > self.config.max_total_cycles:
            return "Exceeded cycle budget"
        if telemetry.halted_early is False and telemetry.cycles_used >= self.config.max_total_cycles:
            return "Max recursion reached without halting"
        if entry.latency_ms > self.config.max_latency_ms:
            return "Latency threshold breached"
        current_roi = self.ledger.roi
        if current_roi != float("inf") and current_roi < self.config.min_roi:
            return f"ROI {current_roi} below floor {self.config.min_roi}"
        if not entry.success:
            self.failure_streak += 1
        else:
            self.failure_streak = 0
        if self.failure_streak >= self.config.failure_backoff_limit:
            return "Failure streak triggered backoff"
        return None

    def evaluate(self, entry: LedgerEntry, telemetry: InferenceTelemetry) -> SentinelStatus:
        if self.paused:
            return SentinelStatus(healthy=False, reason=self.reason, paused=True)
        violation = self._should_pause(entry, telemetry)
        if violation:
            self.paused = True
            self.reason = violation
            return SentinelStatus(healthy=False, reason=violation, paused=True)
        return SentinelStatus(healthy=True, reason=None, paused=False)

    def resume(self) -> SentinelStatus:
        self.reset()
        return SentinelStatus(healthy=True, reason=None, paused=False)


__all__ = ["Sentinel", "SentinelStatus"]
