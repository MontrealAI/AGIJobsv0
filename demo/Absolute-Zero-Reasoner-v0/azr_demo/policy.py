"""Task-Relative REINFORCE++ style baseline tracker for the demo."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import DefaultDict, Dict, Tuple

from .tasks import TaskType

Role = str
Key = Tuple[Role, TaskType]


@dataclass
class TemperatureState:
    value: float
    min_value: float
    max_value: float
    step: float

    def adjust(self, advantage: float) -> float:
        if advantage > 0:
            self.value = max(self.min_value, self.value - self.step)
        elif advantage < 0:
            self.value = min(self.max_value, self.value + self.step)
        return self.value


class TRRPlusPlusPolicy:
    """Lightweight control loop implementing baseline normalisation."""

    def __init__(
        self,
        *,
        baseline_lr: float = 0.2,
        base_temperature: float = 0.8,
        min_temperature: float = 0.25,
        max_temperature: float = 1.4,
        temperature_step: float = 0.05,
    ) -> None:
        self._baseline_lr = baseline_lr
        self._baselines: DefaultDict[Key, float] = defaultdict(float)
        self._temperatures: DefaultDict[Key, TemperatureState] = defaultdict(
            lambda: TemperatureState(
                value=base_temperature,
                min_value=min_temperature,
                max_value=max_temperature,
                step=temperature_step,
            )
        )

    def record(self, role: Role, task_type: TaskType, reward: float) -> Dict[str, float]:
        key = (role, task_type)
        baseline = self._baselines[key]
        advantage = reward - baseline
        updated_baseline = (1 - self._baseline_lr) * baseline + self._baseline_lr * reward
        self._baselines[key] = updated_baseline
        temperature = self._temperatures[key].adjust(advantage)
        return {
            "baseline": updated_baseline,
            "advantage": advantage,
            "temperature": temperature,
        }

    def current_temperature(self, role: Role, task_type: TaskType) -> float:
        return self._temperatures[(role, task_type)].value

    def snapshot(self) -> Dict[str, float]:
        state: Dict[str, float] = {}
        for (role, task_type), baseline in self._baselines.items():
            state[f"{role}:{task_type.value}:baseline"] = baseline
            state[f"{role}:{task_type.value}:temperature"] = self._temperatures[(role, task_type)].value
        return state


__all__ = ["TRRPlusPlusPolicy", "TemperatureState"]
