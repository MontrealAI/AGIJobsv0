"""Simplified MuZero-inspired planner."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import List, Sequence

from .config import IntelligenceConfig


@dataclass
class PlanStep:
    description: str
    expected_reward: float


@dataclass
class Plan:
    steps: List[PlanStep]
    projected_roi: float


class MuZeroPlanner:
    """Very small tree-search planner that balances exploration and exploitation."""

    def __init__(self, config: IntelligenceConfig) -> None:
        self._config = config
        self._history: List[float] = []

    def plan(self, task: str) -> Plan:
        candidates = [self._simulate_rollout(task, depth) for depth in range(1, self._config.planner_depth + 1)]
        best = max(candidates, key=lambda plan: plan.projected_roi)
        self._history.append(best.projected_roi)
        return best

    def _simulate_rollout(self, task: str, depth: int) -> Plan:
        steps: List[PlanStep] = []
        cumulative_reward = 0.0
        for i in range(depth):
            exploration = self._config.exploration_weight * random.random()
            exploitation = math.log1p(sum(self._history) + 1) / (i + 1)
            reward = exploration + exploitation
            cumulative_reward += reward
            steps.append(
                PlanStep(
                    description=f"{task}: strategic maneuver {i + 1}",
                    expected_reward=reward,
                )
            )
        projected_roi = cumulative_reward / depth
        return Plan(steps=steps, projected_roi=projected_roi)

    def improvement_trend(self) -> float:
        if len(self._history) < 2:
            return 1.0
        diffs = [b - a for a, b in zip(self._history, self._history[1:])]
        return sum(diffs) / len(diffs)

    def export_state(self) -> Sequence[float]:
        return list(self._history)
