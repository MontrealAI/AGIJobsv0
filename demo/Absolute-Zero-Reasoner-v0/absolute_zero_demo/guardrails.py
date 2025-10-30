"""Thermostat and sentinel guardrails."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Deque, List

from .config import DemoConfig


@dataclass
class GuardrailEvent:
    message: str
    severity: str


@dataclass
class GuardrailManager:
    config: DemoConfig
    _failures: int = 0
    _difficulty: float = 1.0

    def record_iteration(self, success_rate: float, diversity_score: float, cost_spent: float) -> List[GuardrailEvent]:
        events: List[GuardrailEvent] = []
        guard = self.config.guardrails
        if success_rate < guard.target_success_rate * 0.35:
            self._failures += 1
        else:
            self._failures = max(0, self._failures - 1)
        if self._failures > guard.max_consecutive_failures:
            events.append(GuardrailEvent("Consecutive failure threshold reached", "critical"))
        if diversity_score < guard.min_diversity_score:
            events.append(GuardrailEvent("Task diversity degraded", "warning"))
        if cost_spent > guard.max_budget_usd:
            events.append(GuardrailEvent("Budget threshold exceeded", "critical"))
        return events

    @property
    def difficulty_multiplier(self) -> float:
        return max(0.75, min(1.35, self._difficulty))

    def adjust_difficulty(self, success_rate: float) -> None:
        guard = self.config.guardrails
        target = guard.target_success_rate
        if success_rate > target:
            self._difficulty = min(1.5, self._difficulty * 1.05)
        elif success_rate < target:
            self._difficulty = max(0.65, self._difficulty * 0.95)
