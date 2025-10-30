"""Sentinel rules protecting economic performance."""
from __future__ import annotations

import math
import pathlib
import sys
from dataclasses import dataclass
from typing import Dict, Iterable, Mapping, MutableMapping

CURRENT_DIR = pathlib.Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from engine import OmniCurriculumEngine  # type: ignore


@dataclass
class SentinelConfig:
    roi_task_floor: float
    roi_overall_floor: float
    moi_qps_max: float
    moi_daily_max: int
    min_task_entropy: float
    budget_limit: float
    diversity_injection_window: int
    diversity_min_unique: int


@dataclass
class SentinelState:
    disabled_tasks: MutableMapping[str, str]
    fm_queries_today: int = 0
    last_query_timestamp: float = 0.0
    entropy_breach_count: int = 0


class SentinelController:
    def __init__(self, config: SentinelConfig) -> None:
        self._config = config
        self._state = SentinelState(disabled_tasks={})

    @property
    def state(self) -> SentinelState:
        return self._state

    def enforce_roi(self, engine: OmniCurriculumEngine) -> Dict[str, str]:
        violations: Dict[str, str] = {}
        overall_roi_values = [metrics.roi for metrics in engine.metrics.values() if metrics.attempts > 0]
        overall_roi = sum(overall_roi_values) / max(len(overall_roi_values), 1)
        if overall_roi < self._config.roi_overall_floor:
            violations["overall"] = f"ROI {overall_roi:.2f} below floor {self._config.roi_overall_floor:.2f}"
        for task, metrics in engine.metrics.items():
            if metrics.attempts < 5:
                continue
            if metrics.roi < self._config.roi_task_floor:
                self._state.disabled_tasks[task] = f"ROI {metrics.roi:.2f} < {self._config.roi_task_floor:.2f}"
        return violations

    def enforce_diversity(self, distribution_history: Iterable[Mapping[str, float]]) -> Dict[str, str]:
        alerts: Dict[str, str] = {}
        recent = list(distribution_history)[-self._config.diversity_injection_window :]
        if not recent:
            return alerts
        aggregated = {task: 0.0 for task in recent[0].keys()}
        for snapshot in recent:
            for task, prob in snapshot.items():
                aggregated[task] += prob
        total = sum(aggregated.values())
        entropy = 0.0
        unique = 0
        for value in aggregated.values():
            if value <= 0:
                continue
            unique += 1
            p = value / total
            entropy -= p * math.log(p + 1e-9)
        if unique < self._config.diversity_min_unique or entropy < self._config.min_task_entropy:
            alerts["diversity"] = (
                f"Entropy {entropy:.2f} (unique tasks {unique}) below threshold"
            )
        return alerts

    def disable_tasks(self) -> Iterable[str]:
        return list(self._state.disabled_tasks.keys())

    def is_task_allowed(self, task: str) -> bool:
        return task not in self._state.disabled_tasks
