from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .proposer import TaskProposer
from .tasks import TaskOutcome, TaskType


@dataclass
class ThermostatState:
    target_success_rate: float
    target_valid_rate: float
    diversity_floor: float


class GuardrailCenter:
    def __init__(self, config: dict, proposer: TaskProposer) -> None:
        self.thermostat = ThermostatState(
            target_success_rate=float(config.get("target_success_rate", 0.55)),
            target_valid_rate=float(config.get("target_valid_rate", 0.85)),
            diversity_floor=float(config.get("diversity_floor", 0.35)),
        )
        self.max_iterations = int(config.get("max_iterations_per_run", 500))
        self.proposer = proposer
        self.iteration = 0

    def check(self, iteration: int, outcomes: List[TaskOutcome], diversity: float, success_rate: float, valid_rate: float) -> List[str]:
        self.iteration = iteration
        alerts: List[str] = []
        if iteration >= self.max_iterations:
            alerts.append("iteration-limit-reached")
        if success_rate > self.thermostat.target_success_rate + 0.15:
            adjustment = self.proposer.adjust_difficulty(self.proposer.difficulty_step)
            alerts.append(f"thermostat:success-too-high:{adjustment}")
        elif success_rate < self.thermostat.target_success_rate - 0.25:
            adjustment = self.proposer.adjust_difficulty(-self.proposer.difficulty_step)
            alerts.append(f"thermostat:success-too-low:{adjustment}")
        if diversity < self.thermostat.diversity_floor:
            alerts.append("diversity-floor-breached")
        if valid_rate < self.thermostat.target_valid_rate:
            alerts.append("validity-drop")
        return alerts


__all__ = ["GuardrailCenter"]
