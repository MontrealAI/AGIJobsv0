"""Greedy baseline strategy to compare against HGM."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict

from .config import DemoConfig


@dataclass(slots=True)
class BaselineMetrics:
    evaluations: int = 0
    successes: int = 0
    cost: float = 0.0
    gmv: float = 0.0

    @property
    def roi(self) -> float:
        if self.cost == 0:
            return float("inf")
        return self.gmv / self.cost


class GreedyBaseline:
    """A naive policy that repeatedly evaluates the best-known agent."""

    def __init__(self, config: DemoConfig, rng: random.Random) -> None:
        self.config = config
        self._rng = rng
        self.metrics = BaselineMetrics()
        self._quality = 0.35

    def run(self) -> BaselineMetrics:
        for _ in range(self.config.max_evaluations):
            success = self._rng.random() < self._quality
            self.metrics.evaluations += 1
            self.metrics.cost += self.config.evaluation_cost
            if success:
                self.metrics.successes += 1
                self.metrics.gmv += self.config.success_reward
                self._quality = min(0.7, self._quality + 0.005)
            else:
                self._quality = max(0.05, self._quality - 0.035)
        return self.metrics

