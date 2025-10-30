"""Reward shaping utilities for the Absolute Zero Reasoner demo."""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, DefaultDict, Dict

from .tasks import TaskType


@dataclass
class RewardBreakdown:
    proposer_reward: float
    solver_reward: float
    total_solver_reward: float
    format_penalty: float
    success: bool


class RewardEngine:
    """Compute proposer and solver rewards with verifiable signals."""

    def __init__(
        self,
        *,
        history_window: int = 50,
        economic_weight: float = 0.1,
        format_penalty: float = 0.5,
    ) -> None:
        self._history: DefaultDict[TaskType, Deque[int]] = defaultdict(
            lambda: deque(maxlen=history_window)
        )
        self._economic_weight = economic_weight
        self._format_penalty = format_penalty

    def _update_history(self, task_type: TaskType, success: bool) -> float:
        history = self._history[task_type]
        history.append(1 if success else 0)
        if not history:
            return 0.0
        return sum(history) / len(history)

    def _learnability_reward(self, success_rate: float) -> float:
        return 4 * success_rate * (1 - success_rate)

    def compute(
        self,
        *,
        task_type: TaskType,
        solver_success: bool,
        economic_value: float,
        format_ok: bool,
    ) -> RewardBreakdown:
        success_rate = self._update_history(task_type, solver_success)
        proposer_reward = self._learnability_reward(success_rate)
        solver_reward = 1.0 if solver_success else 0.0
        total_solver = solver_reward + self._economic_weight * economic_value
        penalty = 0.0 if format_ok else self._format_penalty
        total_solver = max(0.0, total_solver - penalty)
        return RewardBreakdown(
            proposer_reward=proposer_reward,
            solver_reward=solver_reward,
            total_solver_reward=total_solver,
            format_penalty=penalty,
            success=solver_success,
        )

    def snapshot(self) -> Dict[str, float]:
        return {
            f"history:{task_type.value}": sum(history) / len(history)
            for task_type, history in self._history.items()
            if history
        }


__all__ = ["RewardEngine", "RewardBreakdown"]
