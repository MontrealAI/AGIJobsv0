"""Thermostat control plane that tunes parameters on-the-fly."""
from __future__ import annotations

from collections import deque
from statistics import mean
from typing import Deque

from .configuration import ThermostatConfig
from .engine import HGMEngine


class Thermostat:
    """Real-time adaptive controller for the HGM demo."""

    def __init__(self, config: ThermostatConfig, engine: HGMEngine) -> None:
        self.config = config
        self.engine = engine
        self._roi_window: Deque[float] = deque(maxlen=config.smoothing_window)

    def observe(self, roi: float) -> None:
        self._roi_window.append(roi)

    def adjust(self) -> None:
        if not self._roi_window:
            return
        current_roi = mean(self._roi_window)
        # Adjust tau towards target ROI
        if current_roi < self.config.roi_floor:
            self.engine.hgm_config.tau = max(0.4, self.engine.hgm_config.tau - self.config.tau_step)
        elif current_roi > self.config.evaluation_enhancement_threshold:
            self.engine.hgm_config.tau = min(5.0, self.engine.hgm_config.tau + self.config.tau_step)

        # Adjust alpha to control expansion pace
        if current_roi >= self.config.roi_target:
            self.engine.hgm_config.alpha = max(1.0, self.engine.hgm_config.alpha - self.config.alpha_step)
        else:
            self.engine.hgm_config.alpha = min(3.5, self.engine.hgm_config.alpha + self.config.alpha_step)

        # Adjust concurrency limit within allowable bounds
        if current_roi >= self.config.roi_target:
            new_limit = self.engine.concurrency_limit + self.config.concurrency_step
        else:
            new_limit = self.engine.concurrency_limit - self.config.concurrency_step
        self.engine.update_concurrency(new_limit)


__all__ = ["Thermostat"]
