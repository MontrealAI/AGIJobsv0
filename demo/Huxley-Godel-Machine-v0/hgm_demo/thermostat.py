"""Adaptive control plane for the HGM demo."""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import DemoConfig
from .engine import HGMEngine
from .simulation import EvaluationOutcome


@dataclass(slots=True)
class Thermostat:
    """Adjusts sampling concentration and concurrency based on ROI."""

    config: DemoConfig
    engine: HGMEngine

    current_concurrency: int = field(init=False)
    _last_adjust_iteration: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        self.current_concurrency = self.config.concurrency

    def observe(self, outcome: EvaluationOutcome) -> None:
        # Currently unused but reserved for richer heuristics.
        pass

    def maybe_adjust(self, iteration: int, persistence) -> None:
        if iteration - self._last_adjust_iteration < self.config.thermostat_interval:
            return

        roi = self.engine.metrics.roi
        if roi < self.config.roi_target:
            # Encourage exploration when ROI stagnates.
            new_tau = max(0.5, self.engine.tau * 0.9)
            self.engine.update_tau(new_tau)
            self.current_concurrency = max(self.config.concurrency_bounds[0], self.current_concurrency - 1)
        else:
            new_tau = min(5.0, self.engine.tau * 1.1)
            self.engine.update_tau(new_tau)
            self.current_concurrency = min(self.config.concurrency_bounds[1], self.current_concurrency + 1)

        # Adjust alpha inversely with ROI to widen/narrow the tree adaptively.
        if roi < self.config.roi_target:
            self.engine.update_alpha(min(3.0, self.engine.alpha + 0.1))
        else:
            self.engine.update_alpha(max(0.8, self.engine.alpha - 0.1))

        self._last_adjust_iteration = iteration

