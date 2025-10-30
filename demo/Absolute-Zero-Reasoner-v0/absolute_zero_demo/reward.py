"""Reward shaping aligned with AZR principles."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Tuple

from .config import DemoConfig
from .utils import Task, rolling_mean, sigmoid


@dataclass
class RewardEngine:
    """Compute proposer and solver rewards."""

    config: DemoConfig

    def __post_init__(self) -> None:
        self._history: Dict[str, list[bool]] = {"deduction": []}

    def proposer_reward(self, task: Task, solved: bool) -> float:
        history = self._history.setdefault(task.task_type, [])
        history.append(solved)
        if len(history) > self.config.telemetry_window:
            del history[0]
        success_rate = rolling_mean(1.0 if item else 0.0 for item in history)
        learnability = 4 * success_rate * (1 - success_rate)
        return self.config.reward_weights.learnability * learnability

    def solver_reward(self, task: Task, solved: bool, economic_value: float, formatted: bool) -> float:
        reward = 0.0
        if solved:
            reward += self.config.reward_weights.correctness
        reward += self.config.reward_weights.economic_utility * economic_value
        if not formatted:
            reward += self.config.reward_weights.format_penalty
        return reward
