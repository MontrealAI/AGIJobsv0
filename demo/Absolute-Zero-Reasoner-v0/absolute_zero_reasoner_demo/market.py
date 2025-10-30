from __future__ import annotations

from dataclasses import dataclass

from .tasks import AZRTask


@dataclass
class MarketSimulatorConfig:
    human_hour_value_usd: float = 85.0
    baseline_completion_minutes: float = 15.0
    ai_completion_minutes: float = 0.5
    complexity_bonus_weight: float = 10.0


class MarketSimulator:
    def __init__(self, config: dict) -> None:
        self.config = MarketSimulatorConfig(
            human_hour_value_usd=float(config.get("human_hour_value_usd", 85.0)),
            baseline_completion_minutes=float(config.get("baseline_completion_minutes", 15.0)),
            ai_completion_minutes=float(config.get("ai_completion_minutes", 0.5)),
            complexity_bonus_weight=float(config.get("complexity_bonus_weight", 10.0)),
        )

    def estimate(self, task: AZRTask, solved: bool) -> float:
        if not solved:
            return 0.0
        baseline_cost = self.config.human_hour_value_usd * (self.config.baseline_completion_minutes / 60.0)
        ai_cost = self.config.human_hour_value_usd * (self.config.ai_completion_minutes / 60.0)
        base_value = max(0.0, baseline_cost - ai_cost)
        complexity_bonus = self.config.complexity_bonus_weight * max(task.difficulty, 0.1)
        return round(base_value + complexity_bonus, 2)


__all__ = ["MarketSimulator", "MarketSimulatorConfig"]
