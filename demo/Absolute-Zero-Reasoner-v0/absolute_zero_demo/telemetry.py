"""Telemetry capture for the demo."""
from __future__ import annotations

import collections
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable

from .config import DemoConfig
from .utils import timestamp_ms


@dataclass
class MetricSnapshot:
    timestamp_ms: int
    tasks_proposed: int
    tasks_solved: int
    gross_value: float
    cost_spent: float

    @property
    def success_rate(self) -> float:
        return 0.0 if self.tasks_proposed == 0 else self.tasks_solved / self.tasks_proposed


@dataclass
class TelemetryTracker:
    config: DemoConfig
    _window: Deque[MetricSnapshot] = field(default_factory=collections.deque)

    def push(self, snapshot: MetricSnapshot) -> None:
        self._window.append(snapshot)
        self._window = collections.deque(
            list(self._window)[-self.config.telemetry_window :]
        )

    def aggregate(self) -> MetricSnapshot:
        tasks_proposed = sum(item.tasks_proposed for item in self._window)
        tasks_solved = sum(item.tasks_solved for item in self._window)
        gross_value = sum(item.gross_value for item in self._window)
        cost_spent = sum(item.cost_spent for item in self._window)
        return MetricSnapshot(timestamp_ms(), tasks_proposed, tasks_solved, gross_value, cost_spent)
