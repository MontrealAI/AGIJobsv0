"""Adaptive control plane that tunes HGM parameters in real time."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .engine import HGMEngine
from .metrics import RunMetrics


@dataclass
class ThermostatConfig:
    target_roi: float = 1.4
    boost_roi: float = 2.2
    tau_step: float = 0.15
    alpha_step: float = 0.1
    min_tau: float = 0.4
    max_tau: float = 5.0
    min_alpha: float = 1.0
    max_alpha: float = 3.0
    min_concurrency: int = 1
    max_concurrency: int = 1
    roi_window: int = 4


@dataclass
class ThermostatDecision:
    tau: float
    alpha: float
    concurrency: int
    notes: List[str]


class Thermostat:
    def __init__(self, config: ThermostatConfig | None = None) -> None:
        self.config = config or ThermostatConfig()
        self._concurrency = self.config.min_concurrency

    @property
    def concurrency(self) -> int:
        return self._concurrency

    def evaluate(self, engine: HGMEngine, metrics: RunMetrics) -> ThermostatDecision:
        notes: List[str] = []
        tau = engine.tau
        alpha = engine.alpha
        roi = metrics.roi

        if metrics.total_cost == 0:
            return ThermostatDecision(tau=tau, alpha=alpha, concurrency=self._concurrency, notes=["Waiting for first signal"])

        if roi < self.config.target_roi:
            tau = min(self.config.max_tau, tau + self.config.tau_step)
            alpha = min(self.config.max_alpha, alpha + self.config.alpha_step)
            if self._concurrency > self.config.min_concurrency:
                self._concurrency -= 1
                notes.append("ROI under target: throttling concurrency")
            notes.append("ROI under target: increasing exploitation bias")
        elif roi > self.config.boost_roi:
            tau = max(self.config.min_tau, tau - self.config.tau_step)
            alpha = max(self.config.min_alpha, alpha - self.config.alpha_step)
            if self._concurrency < self.config.max_concurrency:
                self._concurrency += 1
                notes.append("ROI excellent: scaling concurrency")
            notes.append("ROI excellent: encouraging exploration")
        else:
            notes.append("ROI stable: maintaining parameters")

        engine.update_tau(tau)
        engine.update_alpha(alpha)

        return ThermostatDecision(tau=tau, alpha=alpha, concurrency=self._concurrency, notes=notes)


__all__ = ["Thermostat", "ThermostatConfig", "ThermostatDecision"]
