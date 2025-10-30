from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from .tasks import TaskType


Role = str


@dataclass
class Baseline:
    value: float = 0.0
    count: int = 0

    def update(self, reward: float, momentum: float = 0.2) -> None:
        if self.count == 0:
            self.value = reward
        else:
            self.value = (1 - momentum) * self.value + momentum * reward
        self.count += 1

    def advantage(self, reward: float) -> float:
        return reward - self.value


class TRRController:
    def __init__(self) -> None:
        self.baselines: Dict[Tuple[Role, TaskType], Baseline] = {}

    def register(self, role: Role, task_type: TaskType) -> None:
        self.baselines.setdefault((role, task_type), Baseline())

    def update(self, role: Role, task_type: TaskType, reward: float) -> float:
        key = (role, task_type)
        baseline = self.baselines.setdefault(key, Baseline())
        adv = baseline.advantage(reward)
        baseline.update(reward)
        return adv

    def snapshot(self) -> Dict[str, float]:
        return {f"{role}:{task_type.value}": baseline.value for (role, task_type), baseline in self.baselines.items()}


__all__ = ["TRRController"]
