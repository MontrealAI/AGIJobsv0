"""Safety sentinels supervising MuZero value alignment and budgets."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Deque

import numpy as np

from .configuration import SentinelConfig
from .environment import EnvironmentConfig

if TYPE_CHECKING:  # pragma: no cover - avoids circular imports at runtime
    from .training import Episode


@dataclass
class SentinelStatus:
    episodes_observed: int
    mean_absolute_error: float
    alert_active: bool
    fallback_required: bool
    average_simulations: float
    budget_floor_breached: bool


class SentinelMonitor:
    """Tracks calibration drift and budget adherence."""

    def __init__(self, config: SentinelConfig, environment: EnvironmentConfig) -> None:
        self.config = config
        self.environment = environment
        self._value_errors: Deque[float] = deque(maxlen=config.window)
        self._simulations: Deque[int] = deque(maxlen=config.window)
        self._episodes = 0
        self._last_status = SentinelStatus(
            episodes_observed=0,
            mean_absolute_error=0.0,
            alert_active=False,
            fallback_required=False,
            average_simulations=float(environment.max_jobs),
            budget_floor_breached=False,
        )

    def record_episode(self, episode: "Episode") -> SentinelStatus:
        self._episodes += 1
        for predicted, actual in zip(episode.values, episode.returns):
            self._value_errors.append(abs(float(predicted) - float(actual)))
        self._simulations.extend(int(sim) for sim in episode.simulations)
        budget_floor_breached = episode.summary.get("remaining_budget", self.environment.starting_budget) < self.config.budget_floor

        if self._value_errors:
            mae = float(np.mean(self._value_errors))
        else:
            mae = 0.0

        episodes_ready = self._episodes >= self.config.min_episodes
        alert = episodes_ready and (mae > self.config.alert_mae or budget_floor_breached)
        fallback = episodes_ready and (mae > self.config.fallback_mae or budget_floor_breached)
        avg_sim = float(np.mean(self._simulations)) if self._simulations else 0.0

        self._last_status = SentinelStatus(
            episodes_observed=self._episodes,
            mean_absolute_error=mae,
            alert_active=alert,
            fallback_required=fallback,
            average_simulations=avg_sim,
            budget_floor_breached=budget_floor_breached,
        )
        return self._last_status

    def status(self) -> SentinelStatus:
        return self._last_status


__all__ = ["SentinelMonitor", "SentinelStatus"]
