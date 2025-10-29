"""Economic thermostat that tunes TRM parameters based on ROI."""

from __future__ import annotations

from dataclasses import dataclass

from .config import ThermostatConfig
from .engine import TinyRecursiveModelEngine
from .ledger import EconomicLedger


@dataclass
class ThermostatSnapshot:
    roi: float
    inner_cycles: int
    outer_steps: int
    halt_threshold: float
    concurrency: int


class Thermostat:
    """Feedback controller that keeps ROI near a target."""

    def __init__(
        self,
        config: ThermostatConfig,
        ledger: EconomicLedger,
        engine: TinyRecursiveModelEngine,
    ) -> None:
        self.config = config
        self.ledger = ledger
        self.engine = engine
        self.current_inner_cycles = engine.inner_cycles
        self.current_outer_steps = engine.outer_steps
        self.current_halt_threshold = engine.halt_threshold
        self.current_concurrency = config.min_concurrency

    def _adjust(self, roi: float) -> None:
        target = self.config.target_roi
        delta = roi - target
        if delta < 0:  # ROI below target → save compute
            self.current_inner_cycles = max(self.config.min_inner_cycles, self.current_inner_cycles - 1)
            self.current_outer_steps = max(self.config.min_outer_steps, self.current_outer_steps - 1)
            self.current_halt_threshold = min(
                self.config.max_halt_threshold,
                self.current_halt_threshold + 0.05,
            )
            self.current_concurrency = max(self.config.min_concurrency, self.current_concurrency - 1)
        else:  # ROI healthy → allow more thinking (bounded)
            self.current_inner_cycles = min(self.config.max_inner_cycles, self.current_inner_cycles + 1)
            self.current_outer_steps = min(self.config.max_outer_steps, self.current_outer_steps + 1)
            self.current_halt_threshold = max(
                self.config.min_halt_threshold,
                self.current_halt_threshold - 0.05,
            )
            self.current_concurrency = min(self.config.max_concurrency, self.current_concurrency + 1)

    def update(self) -> ThermostatSnapshot:
        recent_roi = self.ledger.recent_roi(self.config.window)
        self._adjust(recent_roi)
        self.engine.inner_cycles = self.current_inner_cycles
        self.engine.outer_steps = self.current_outer_steps
        self.engine.halt_threshold = self.current_halt_threshold
        return ThermostatSnapshot(
            roi=recent_roi,
            inner_cycles=self.current_inner_cycles,
            outer_steps=self.current_outer_steps,
            halt_threshold=self.current_halt_threshold,
            concurrency=self.current_concurrency,
        )


__all__ = ["Thermostat", "ThermostatSnapshot"]
