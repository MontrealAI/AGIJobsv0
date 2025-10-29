"""Economic control plane for the HGM demo."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque

from .structures import EconomicLedger


@dataclass
class ThermostatSettings:
    target_roi: float
    min_tau: float
    max_tau: float
    tau_step: float
    alpha_step: float
    min_alpha: float
    max_alpha: float
    min_concurrency: int
    max_concurrency: int
    roi_window: int


class Thermostat:
    """Feedback controller that tunes exploration parameters on the fly."""

    def __init__(self, settings: ThermostatSettings) -> None:
        self.settings = settings
        self._roi_history: Deque[float] = deque(maxlen=settings.roi_window)

    def update(self, *, ledger: EconomicLedger, engine, orchestrator) -> None:
        self._roi_history.append(ledger.roi)
        if len(self._roi_history) < self.settings.roi_window:
            return
        avg_roi = sum(self._roi_history) / len(self._roi_history)
        tau = engine.params.tau
        alpha = engine.params.alpha
        concurrency = orchestrator.concurrency
        if avg_roi < self.settings.target_roi:
            tau = min(self.settings.max_tau, tau + self.settings.tau_step)
            alpha = min(self.settings.max_alpha, alpha + self.settings.alpha_step)
            concurrency = max(self.settings.min_concurrency, concurrency - 1)
        else:
            tau = max(self.settings.min_tau, tau - self.settings.tau_step)
            alpha = max(self.settings.min_alpha, alpha - self.settings.alpha_step)
            concurrency = min(self.settings.max_concurrency, concurrency + 1)
        engine.update_parameters(tau=tau, alpha=alpha)
        orchestrator.set_concurrency(concurrency)
