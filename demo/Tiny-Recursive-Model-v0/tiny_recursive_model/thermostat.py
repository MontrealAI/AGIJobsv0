"""ROI-driven thermostat controller for Tiny Recursive Model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import ThermostatConfig
from .economic import EconomicLedger


@dataclass
class ThermostatState:
    inner_cycles: int
    outer_steps: int
    halt_threshold: float
    concurrency: int


class ThermostatController:
    def __init__(self, config: ThermostatConfig) -> None:
        self.config = config
        self.state = ThermostatState(
            inner_cycles=config.max_inner_cycles,
            outer_steps=config.max_outer_steps,
            halt_threshold=config.min_halt_threshold,
            concurrency=config.concurrency.min,
        )

    def update(self, ledger: EconomicLedger) -> ThermostatState:
        roi = ledger.recent_roi(self.config.window)
        target = ledger.config.target_roi
        delta = roi - target
        adjust = self.config.adjustment_rate

        if roi == 0:
            # Cold start: keep defaults
            return self.state

        new_inner = self._clamp(
            self.state.inner_cycles + (-adjust if delta < 0 else adjust),
            self.config.min_inner_cycles,
            self.config.max_inner_cycles,
        )
        new_outer = self._clamp(
            self.state.outer_steps + (-adjust if delta < 0 else adjust),
            self.config.min_outer_steps,
            self.config.max_outer_steps,
        )
        new_halt = self._clamp(
            self.state.halt_threshold + (adjust if delta < 0 else -adjust),
            self.config.min_halt_threshold,
            self.config.max_halt_threshold,
        )
        new_concurrency = int(
            self._clamp(
                self.state.concurrency + (-1 if delta < 0 else 1),
                self.config.concurrency.min,
                self.config.concurrency.max,
            )
        )
        self.state = ThermostatState(
            inner_cycles=int(round(new_inner)),
            outer_steps=int(round(new_outer)),
            halt_threshold=float(new_halt),
            concurrency=new_concurrency,
        )
        return self.state

    @staticmethod
    def _clamp(value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))
