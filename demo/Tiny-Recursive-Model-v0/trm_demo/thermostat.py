"""Thermostat controller for dynamic TRM parameter tuning."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .economic import EconomicLedger


@dataclass
class ThermostatConfig:
    """Configuration for the ROI thermostat."""

    target_roi: float = 2.0
    window: int = 25
    min_cycles: int = 3
    max_cycles: int = 8
    min_outer_steps: int = 2
    max_outer_steps: int = 5
    min_halt_threshold: float = 0.5
    max_halt_threshold: float = 0.85


class Thermostat:
    """Adaptive controller that tunes TRM recursion parameters based on ROI."""

    def __init__(self, config: Optional[ThermostatConfig] = None) -> None:
        self.config = config or ThermostatConfig()

    def recommend(
        self,
        ledger: EconomicLedger,
        current_cycles: int,
        current_steps: int,
        current_halt: float,
    ) -> tuple[int, int, float]:
        """Return suggested (n_cycles, outer_steps, halt_threshold)."""

        if not ledger.entries:
            return current_cycles, current_steps, current_halt

        recent = ledger.window(self.config.window)
        roi = recent.roi

        if roi >= self.config.target_roi:
            n_cycles = min(current_cycles + 1, self.config.max_cycles)
            outer_steps = min(current_steps + 1, self.config.max_outer_steps)
            halt_threshold = max(current_halt - 0.02, self.config.min_halt_threshold)
        else:
            n_cycles = max(current_cycles - 1, self.config.min_cycles)
            outer_steps = max(current_steps - 1, self.config.min_outer_steps)
            halt_threshold = min(current_halt + 0.05, self.config.max_halt_threshold)

        return n_cycles, outer_steps, halt_threshold

