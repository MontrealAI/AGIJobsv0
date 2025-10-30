"""Economic utility estimator."""
from __future__ import annotations

import math
from dataclasses import dataclass

from .config import DemoConfig
from .utils import Task


@dataclass
class MarketSimulator:
    config: DemoConfig

    def estimate_value(self, task: Task, runtime_seconds: float) -> float:
        assumptions = self.config.economic_assumptions
        human_minutes = assumptions.average_task_minutes_saved
        human_cost = (human_minutes / 60.0) * assumptions.baseline_human_cost_per_hour
        compute_cost = runtime_seconds * assumptions.compute_cost_per_second
        platform_share = human_cost * assumptions.marketplace_fee_share
        bonus = 0.0
        if "running_total" in task.program:
            bonus += 0.8
        if "smooth_average" in task.program:
            bonus += 0.6
        return max(0.0, human_cost + platform_share - compute_cost + bonus)
