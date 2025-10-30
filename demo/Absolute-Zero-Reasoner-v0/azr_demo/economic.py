"""Lightweight economic utility simulator for the demo."""
from __future__ import annotations

from dataclasses import dataclass

from .tasks import AZRTask


@dataclass
class EconomicSimulator:
    base_value: float = 25.0
    difficulty_multiplier: float = 40.0
    latency_penalty: float = 5.0
    target_latency: float = 1.0

    def estimate(self, task: AZRTask, *, success: bool, latency: float) -> float:
        if not success:
            return 0.0
        difficulty = float(task.metadata.get("difficulty", 0.5))
        nominal = self.base_value + self.difficulty_multiplier * difficulty
        lateness = max(0.0, latency - self.target_latency)
        penalty = self.latency_penalty * lateness
        return max(0.0, nominal - penalty)


__all__ = ["EconomicSimulator"]
