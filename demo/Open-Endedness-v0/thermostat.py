"""Thermostat controller for economic governance."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Mapping


@dataclass
class ThermostatConfig:
    roi_target: float
    roi_floor: float
    fm_cost_per_call: float
    max_daily_fm_cost: float
    epsilon_range: Mapping[str, float]
    moi_interval_bounds: Mapping[str, int]
    adjust_every: int
    gmvs_smoothing_beta: float
    cost_smoothing_beta: float


@dataclass
class ThermostatState:
    rolling_roi: float = 0.0
    fm_cost_today: float = 0.0
    epsilon: float = 0.0
    moi_interval: int = 0
    adjustments: int = 0


class ThermostatController:
    """Adjusts OMNI parameters based on economic performance."""

    def __init__(self, config: ThermostatConfig, initial_epsilon: float, initial_interval: int) -> None:
        self._config = config
        self._state = ThermostatState(
            epsilon=initial_epsilon,
            moi_interval=initial_interval,
        )

    @property
    def state(self) -> ThermostatState:
        return self._state

    def ingest_metrics(self, roi: float, fm_calls_today: int, cumulative_gmv: float, cumulative_cost: float) -> None:
        beta_roi = self._config.gmvs_smoothing_beta
        if self._state.adjustments == 0:
            self._state.rolling_roi = roi
        else:
            self._state.rolling_roi = beta_roi * self._state.rolling_roi + (1 - beta_roi) * roi
        self._state.fm_cost_today = fm_calls_today * self._config.fm_cost_per_call

    def adjust(self) -> Dict[str, float]:
        self._state.adjustments += 1
        epsilon_min = float(self._config.epsilon_range["min"])
        epsilon_max = float(self._config.epsilon_range["max"])
        interval_min = int(self._config.moi_interval_bounds["min"])
        interval_max = int(self._config.moi_interval_bounds["max"])

        roi = self._state.rolling_roi
        fm_cost = self._state.fm_cost_today
        epsilon = self._state.epsilon
        interval = self._state.moi_interval

        if roi < self._config.roi_floor or fm_cost > self._config.max_daily_fm_cost:
            epsilon = max(epsilon * 0.7, epsilon_min)
            interval = min(interval * 2, interval_max)
        elif roi > self._config.roi_target and fm_cost < 0.5 * self._config.max_daily_fm_cost:
            epsilon = min(epsilon * 1.1, epsilon_max)
            interval = max(interval // 2, interval_min)

        self._state.epsilon = epsilon
        self._state.moi_interval = interval
        return {"epsilon": epsilon, "moi_interval": interval}
