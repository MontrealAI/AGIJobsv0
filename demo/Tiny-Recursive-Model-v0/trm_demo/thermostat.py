"""Adaptive ROI-aware thermostat that tunes TRM recursion parameters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .config import TinyRecursiveModelConfig
from .engine import TRMEngine
from .ledger import EconomicLedger


@dataclass(slots=True)
class ThermostatSettings:
    target_roi: float = 2.0
    min_inner_cycles: int = 4
    max_inner_cycles: int = 8
    min_outer_steps: int = 2
    max_outer_steps: int = 5
    min_halt_threshold: float = 0.45
    max_halt_threshold: float = 0.75
    adjustment_rate: float = 0.05
    roi_window: int = 50


class Thermostat:
    """Closed-loop controller that keeps TRM ROI near a configurable target."""

    def __init__(self, settings: Optional[ThermostatSettings] = None) -> None:
        self.settings = settings or ThermostatSettings()

    def _clamp(self, value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))

    def update(self, ledger: EconomicLedger, engine: TRMEngine) -> TinyRecursiveModelConfig:
        """Adjust TRM parameters according to realised ROI."""

        roi = ledger.rolling_roi(self.settings.roi_window)
        cfg = engine.config
        if roi == float("inf"):
            return cfg

        delta = roi - self.settings.target_roi
        adjustment = self.settings.adjustment_rate * delta

        new_halt_threshold = self._clamp(
            cfg.halt_threshold + adjustment * 0.2,
            self.settings.min_halt_threshold,
            self.settings.max_halt_threshold,
        )
        new_inner_cycles = int(
            round(
                self._clamp(
                    cfg.inner_cycles * (1.0 + adjustment * 0.1),
                    self.settings.min_inner_cycles,
                    self.settings.max_inner_cycles,
                )
            )
        )
        new_outer_steps = int(
            round(
                self._clamp(
                    cfg.outer_steps * (1.0 + adjustment * 0.1),
                    self.settings.min_outer_steps,
                    self.settings.max_outer_steps,
                )
            )
        )

        engine.update_hyperparameters(
            halt_threshold=new_halt_threshold,
            inner_cycles=new_inner_cycles,
            outer_steps=new_outer_steps,
        )
        return engine.config

