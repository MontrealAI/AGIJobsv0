"""Sentinel guardrails to enforce ROI and latency constraints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from .economic import EconomicLedger


@dataclass
class SentinelConfig:
    """Parameters controlling the sentinel guardrails."""

    roi_floor: float = 1.2
    max_cost: float = 50.0
    max_latency_ms: float = 2000.0
    max_steps: int = 18


class Sentinel:
    """Guardrail monitor that can halt TRM usage when constraints are violated."""

    def __init__(self, config: Optional[SentinelConfig] = None) -> None:
        self.config = config or SentinelConfig()
        self._halt_requested = False
        self._reason = ""

    @property
    def halt_requested(self) -> bool:
        return self._halt_requested

    @property
    def reason(self) -> str:
        return self._reason

    def evaluate(
        self,
        *,
        ledger: EconomicLedger,
        cumulative_cost: float,
        last_run_latency_ms: float,
        last_run_steps: int,
    ) -> None:
        """Evaluate the guardrails and update the halt flag if needed."""

        self._halt_requested = False
        self._reason = ""

        if ledger.entries and ledger.roi < self.config.roi_floor:
            self._halt_requested = True
            self._reason = "ROI floor breached"
            return

        if cumulative_cost > self.config.max_cost:
            self._halt_requested = True
            self._reason = "Cost budget exhausted"
            return

        if last_run_latency_ms > self.config.max_latency_ms:
            self._halt_requested = True
            self._reason = "Latency guardrail triggered"
            return

        if last_run_steps > self.config.max_steps:
            self._halt_requested = True
            self._reason = "Recursion depth exceeded"

    def status(self) -> Dict[str, str | float | bool]:
        return {
            "halt_requested": self._halt_requested,
            "reason": self._reason,
        }

