"""Economic thermostat regulating MCTS simulation budgets."""
from __future__ import annotations

from typing import Dict

import math


class PlanningThermostat:
    def __init__(self, config: Dict) -> None:
        settings = config.get("thermostat", {})
        self.enabled = bool(settings.get("enable", True))
        self.low_entropy_threshold = float(settings.get("low_entropy_threshold", 0.3))
        self.high_entropy_threshold = float(settings.get("high_entropy_threshold", 0.7))
        self.min_simulations = int(settings.get("min_simulations", 32))
        self.max_simulations = int(settings.get("max_simulations", 192))
        self.latency_budget = float(settings.get("latency_budget_ms", 120))
        self.simulation_cost = float(settings.get("simulation_cost_ms", 1.0))

    def decide(self, base_simulations: int, visit_distribution_entropy: float, decision_value_gap: float) -> int:
        if not self.enabled:
            return base_simulations
        entropy_factor = 1.0
        if visit_distribution_entropy < self.low_entropy_threshold:
            entropy_factor = 0.6
        elif visit_distribution_entropy > self.high_entropy_threshold:
            entropy_factor = 1.4
        gap_factor = 1.0
        if decision_value_gap < 0.05:
            gap_factor = 1.5
        elif decision_value_gap > 0.25:
            gap_factor = 0.7
        simulations = int(base_simulations * entropy_factor * gap_factor)
        simulations = max(self.min_simulations, min(simulations, self.max_simulations))
        max_allowed = int(self.latency_budget / max(self.simulation_cost, 1e-6))
        return min(simulations, max_allowed)

    @staticmethod
    def entropy(probabilities) -> float:
        total = 0.0
        for p in probabilities:
            if p > 0:
                total -= p * math.log(p + 1e-9)
        return total
