from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Tuple

from .market import MarketSimulator
from .tasks import AZRTask, TaskOutcome, TaskType


@dataclass
class RewardConfig:
    learnability_weight: float
    correctness_weight: float
    econ_weight: float
    format_penalty: float


class RewardEngine:
    def __init__(self, config: dict, market: MarketSimulator) -> None:
        self.learnability_weight = float(config.get("learnability_weight", 1.0))
        self.correctness_weight = float(config.get("correctness_weight", 1.0))
        self.econ_weight = float(config.get("econ_weight", 0.2))
        self.format_penalty = float(config.get("format_penalty", 0.5))
        self.market = market
        self.success_rates = {
            TaskType.DEDUCTION: 0.0,
            TaskType.ABDUCTION: 0.0,
            TaskType.INDUCTION: 0.0,
        }
        self.attempt_counts = {
            TaskType.DEDUCTION: 1,
            TaskType.ABDUCTION: 1,
            TaskType.INDUCTION: 1,
        }

    def update_success(self, task_type: TaskType, solved: bool) -> None:
        total = self.attempt_counts[task_type]
        rate = self.success_rates[task_type]
        new_rate = (rate * total + (1 if solved else 0)) / (total + 1)
        self.success_rates[task_type] = new_rate
        self.attempt_counts[task_type] = total + 1

    def compute_rewards(self, task: AZRTask, solved: bool, format_ok: bool, solver_output) -> Tuple[float, float, float]:
        econ_value = self.market.estimate(task, solved)
        if not format_ok:
            return 0.0, 0.0, econ_value
        learnability = self.learnability_weight * self._learnability(task.task_type)
        correctness = self.correctness_weight * (1.0 if solved else 0.0)
        total_solver_reward = correctness + self.econ_weight * econ_value
        return learnability, total_solver_reward, econ_value

    def _learnability(self, task_type: TaskType) -> float:
        rate = self.success_rates[task_type]
        return 4 * rate * (1 - rate)


__all__ = ["RewardEngine", "RewardConfig"]
