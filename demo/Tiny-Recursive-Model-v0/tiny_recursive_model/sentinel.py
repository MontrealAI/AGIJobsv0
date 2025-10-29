"""Sentinel guardrails for safe TRM operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import SentinelConfig
from .economic import EconomicLedger


@dataclass
class SentinelState:
    halted: bool = False
    reason: Optional[str] = None


class Sentinel:
    def __init__(self, config: SentinelConfig) -> None:
        self.config = config
        self.state = SentinelState()
        self.consecutive_failures = 0

    def evaluate(self, ledger: EconomicLedger, last_latency_ms: float, steps_used: int, outcome: bool) -> SentinelState:
        if outcome:
            self.consecutive_failures = 0
        else:
            self.consecutive_failures += 1

        if ledger.total_cost > self.config.max_cost:
            self.state = SentinelState(halted=True, reason="Cost cap breached")
        elif ledger.roi < self.config.roi_floor and len(ledger.entries) >= 10:
            self.state = SentinelState(halted=True, reason="ROI floor breached")
        elif last_latency_ms > self.config.max_latency_ms:
            self.state = SentinelState(halted=True, reason="Latency guardrail triggered")
        elif steps_used > self.config.max_recursions:
            self.state = SentinelState(halted=True, reason="Recursion limit exceeded")
        elif self.consecutive_failures >= self.config.failure_limit:
            self.state = SentinelState(halted=True, reason="Failure streak detected")
        else:
            self.state = SentinelState(halted=False, reason=None)
        return self.state

    def reset(self) -> None:
        self.state = SentinelState()
        self.consecutive_failures = 0
