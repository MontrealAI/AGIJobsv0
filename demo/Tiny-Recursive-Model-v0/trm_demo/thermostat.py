"""Dynamic ROI thermostat for governing TRM recursion."""
from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Deque, Optional
from collections import deque

from .config import ThermostatSettings
from .ledger import EconomicLedger


@dataclass
class ThermostatState:
    inner_steps: int
    outer_steps: int
    halt_threshold: float


class Thermostat:
    """Feedback controller that tunes recursion parameters based on ROI."""

    def __init__(self, settings: ThermostatSettings) -> None:
        self.settings = settings
        self.history: Deque[float] = deque(maxlen=settings.window)
        self.state = ThermostatState(
            inner_steps=settings.min_inner_steps,
            outer_steps=settings.min_outer_steps,
            halt_threshold=sum(settings.halt_threshold_bounds) / 2,
        )

    def update(self, ledger: EconomicLedger) -> ThermostatState:
        """Update thermostat from latest ROI observations."""
        totals = ledger.totals
        current_roi = totals["roi"] if totals["total_cost"] else self.settings.target_roi
        self.history.append(current_roi)
        average_roi = mean(self.history) if self.history else current_roi

        adjustment = average_roi - self.settings.target_roi
        # If ROI is high, allow more compute; if low, dial back.
        if adjustment >= 0:
            self.state.inner_steps = min(
                self.settings.max_inner_steps,
                int(round(self.state.inner_steps * (1 + self.settings.adjustment_rate / 2))),
            )
            self.state.outer_steps = min(
                self.settings.max_outer_steps,
                int(round(self.state.outer_steps * (1 + self.settings.adjustment_rate / 2))),
            )
            self.state.halt_threshold = max(
                self.settings.halt_threshold_bounds[0],
                self.state.halt_threshold * (1 - self.settings.adjustment_rate / 3),
            )
        else:
            self.state.inner_steps = max(
                self.settings.min_inner_steps,
                int(round(self.state.inner_steps * (1 - self.settings.adjustment_rate))),
            )
            self.state.outer_steps = max(
                self.settings.min_outer_steps,
                int(round(self.state.outer_steps * (1 - self.settings.adjustment_rate))),
            )
            self.state.halt_threshold = min(
                self.settings.halt_threshold_bounds[1],
                self.state.halt_threshold * (1 + self.settings.adjustment_rate),
            )

        return self.state


__all__ = ["Thermostat", "ThermostatState"]
