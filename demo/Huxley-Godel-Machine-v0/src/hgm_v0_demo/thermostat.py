"""Feedback controller that tunes HGM parameters in real time."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque

from .engine import HGMEngine
from .metrics import EconomicSnapshot


@dataclass
class ThermostatConfig:
    target_roi: float
    roi_window: int
    tau_adjustment: float
    alpha_adjustment: float
    concurrency_step: int
    max_concurrency: int
    min_concurrency: int
    roi_upper_margin: float
    roi_lower_margin: float


class Thermostat:
    def __init__(
        self,
        engine: HGMEngine,
        config: ThermostatConfig,
    ) -> None:
        self.engine = engine
        self.config = config
        self._roi_history: Deque[float] = deque(maxlen=config.roi_window)

    def observe(self, snapshot: EconomicSnapshot) -> None:
        self._roi_history.append(snapshot.roi)
        if len(self._roi_history) < self.config.roi_window:
            return
        avg_roi = sum(self._roi_history) / len(self._roi_history)
        lower_bound = self.config.target_roi * (1 - self.config.roi_lower_margin)
        upper_bound = self.config.target_roi * (1 + self.config.roi_upper_margin)

        tau = self.engine.tau
        alpha = self.engine.alpha
        eval_conc = self.engine.max_evaluation_concurrency

        if avg_roi < lower_bound:
            tau *= 1 + self.config.tau_adjustment
            alpha *= 1 + self.config.alpha_adjustment
            eval_conc = max(self.config.min_concurrency, eval_conc - self.config.concurrency_step)
        elif avg_roi > upper_bound:
            tau *= max(0.1, 1 - self.config.tau_adjustment)
            alpha *= max(0.1, 1 - self.config.alpha_adjustment)
            eval_conc = min(self.config.max_concurrency, eval_conc + self.config.concurrency_step)

        self.engine.update_tau(max(0.05, min(10.0, tau)))
        self.engine.update_alpha(max(0.2, min(5.0, alpha)))
        self.engine.set_max_evaluation_concurrency(eval_conc)


__all__ = ["Thermostat", "ThermostatConfig"]
