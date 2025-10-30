"""ROI-aware planning thermostat balancing search depth and latency."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Iterable

import numpy as np
import torch

from .configuration import ThermostatConfig
from .environment import EnvironmentConfig, PlannerObservation
from .mcts import PlannerSettings


@dataclass
class ThermostatTelemetry:
    average_simulations: float
    peak_simulations: int
    floor_simulations: int
    average_value_per_simulation: float


class PlanningThermostat:
    """Adjusts the MCTS simulation budget based on economic context."""

    def __init__(
        self,
        config: ThermostatConfig,
        environment: EnvironmentConfig,
        planner: PlannerSettings,
    ) -> None:
        self.config = config
        self.environment = environment
        self.planner = planner
        self._simulations: Deque[int] = deque(maxlen=256)
        self._value_density: Deque[float] = deque(maxlen=256)

    def recommend(
        self,
        observation: PlannerObservation,
        policy_probs: torch.Tensor,
        legal_actions: Iterable[int],
    ) -> int:
        """Recommend a simulation budget for the current decision."""

        base = self.planner.num_simulations
        legal_indices = list(legal_actions)
        if not legal_indices:
            return base

        legal_policy = policy_probs[legal_indices]
        if legal_policy.sum().item() <= 0:
            legal_policy = torch.ones_like(legal_policy) / len(legal_indices)
        else:
            legal_policy = legal_policy / legal_policy.sum()

        entropy = float(-(legal_policy * torch.log(legal_policy + 1e-8)).sum().item())
        sorted_policy, _ = torch.sort(legal_policy, descending=True)
        top_gap = float(sorted_policy[0].item() - sorted_policy[1].item()) if len(sorted_policy) > 1 else 1.0

        budget_ratio = observation.budget_remaining / (self.environment.starting_budget + 1e-8)
        progress_ratio = observation.step_index / max(1, self.environment.planning_horizon)

        recommendation = base
        if entropy <= self.config.low_entropy and top_gap > 0.25:
            # Confident prediction: trim exploration.
            recommendation = max(self.config.min_simulations, int(base * 0.6))
        elif entropy >= self.config.high_entropy:
            pressure = min(2.0, (entropy - self.config.high_entropy) / max(1e-3, self.config.high_entropy))
            recommendation = min(self.config.max_simulations, int(base * (1.0 + pressure)))

        if budget_ratio <= self.config.budget_pressure_ratio:
            # Low budget remaining -> invest more compute to avoid mistakes.
            recommendation = min(self.config.max_simulations, max(recommendation, int(base * 1.4)))
        elif budget_ratio >= 0.85 and entropy < self.config.low_entropy:
            recommendation = max(self.config.min_simulations, int(recommendation * 0.8))

        if progress_ratio >= self.config.endgame_horizon_ratio:
            recommendation = int(recommendation * 0.85)

        return max(self.config.min_simulations, min(self.config.max_simulations, recommendation))

    def observe(self, simulations: int, root_value: float) -> None:
        self._simulations.append(simulations)
        if simulations > 0:
            self._value_density.append(root_value / float(simulations))

    def telemetry(self) -> ThermostatTelemetry:
        if self._simulations:
            average_sim = float(np.mean(self._simulations))
            peak = int(np.max(self._simulations))
            floor = int(np.min(self._simulations))
        else:
            average_sim = float(self.planner.num_simulations)
            peak = floor = self.planner.num_simulations

        if self._value_density:
            value_density = float(np.mean(self._value_density))
        else:
            value_density = 0.0

        return ThermostatTelemetry(
            average_simulations=average_sim,
            peak_simulations=peak,
            floor_simulations=floor,
            average_value_per_simulation=value_density,
        )


__all__ = ["PlanningThermostat", "ThermostatTelemetry"]
