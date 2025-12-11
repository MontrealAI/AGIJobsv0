"""Monitoring utilities ensuring planner alignment and safety."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, Iterable, List

import numpy as np

from .environment import EnvironmentConfig, config_from_dict
from .training import Episode


@dataclass
class SentinelConfig:
    """Thresholds used by the sentinel monitor."""

    window: int = 64
    alert_mae: float = 25.0
    fallback_mae: float = 45.0
    min_episodes: int = 6
    budget_floor: float = 5.0


@dataclass
class SentinelStatus:
    alert_active: bool
    fallback_required: bool
    budget_floor_breached: bool
    mean_absolute_error: float
    episodes_considered: int


class SentinelMonitor:
    """Aggregate planner statistics to flag misalignment."""

    def __init__(self, config: SentinelConfig, env_config: EnvironmentConfig) -> None:
        self.config = config
        self.env_config = env_config
        self._episodes: Deque[Episode] = deque(maxlen=config.window)

    def record_episode(self, episode: Episode) -> None:
        self._episodes.append(episode)

    def status(self) -> SentinelStatus:
        mae = self._mean_absolute_error()
        episode_count = len(self._episodes)
        alert = episode_count >= self.config.min_episodes and mae >= self.config.alert_mae
        fallback = alert and mae >= self.config.fallback_mae
        budget_floor_breached = any(
            episode.summary.get("remaining_budget", self.env_config.starting_budget) < self.config.budget_floor
            for episode in self._episodes
        )
        return SentinelStatus(
            alert_active=alert,
            fallback_required=fallback,
            budget_floor_breached=budget_floor_breached,
            mean_absolute_error=mae,
            episodes_considered=episode_count,
        )

    def _mean_absolute_error(self) -> float:
        if not self._episodes:
            return 0.0
        errors: List[float] = []
        for episode in self._episodes:
            values = np.asarray(episode.values, dtype=np.float64)
            actuals = np.asarray(episode.returns, dtype=np.float64)
            length = min(values.size, actuals.size)
            if length == 0:
                continue
            errors.extend(np.abs(values[:length] - actuals[:length]).tolist())
        if not errors:
            return 0.0
        return float(np.mean(errors))


__all__ = ["SentinelConfig", "SentinelMonitor", "SentinelStatus"]


class Sentinel:
    """Runtime guard that monitors prediction error and budget health."""

    def __init__(self, config: Dict) -> None:
        sentinel_conf = config.get("sentinel", {})
        env_conf = config.get("environment", {})
        self.config = SentinelConfig(
            window=int(sentinel_conf.get("window", SentinelConfig.window)),
            alert_mae=float(sentinel_conf.get("alert_mae", SentinelConfig.alert_mae)),
            fallback_mae=float(sentinel_conf.get("fallback_mae", SentinelConfig.fallback_mae)),
            min_episodes=int(sentinel_conf.get("min_episodes", SentinelConfig.min_episodes)),
            budget_floor=float(sentinel_conf.get("budget_floor", SentinelConfig.budget_floor)),
        )
        env_config = config_from_dict(config)
        self.monitor = SentinelMonitor(self.config, env_config)
        self._predictions: List[float] = []
        self._returns: List[float] = []

    def update(self, predicted_value: float, realised_return: float) -> None:
        self._predictions.append(predicted_value)
        self._returns.append(realised_return)
        episode = Episode(
            observations=[],
            actions=[],
            rewards=[],
            policies=[],
            values=[predicted_value],
            returns=[realised_return],
            simulations=[],
            summary={"remaining_budget": realised_return},
        )
        self.monitor.record_episode(episode)

    def should_fallback(self) -> bool:
        status = self.monitor.status()
        return status.fallback_required or status.budget_floor_breached

    def reset(self) -> None:
        self._predictions.clear()
        self._returns.clear()


__all__ += ["Sentinel"]
