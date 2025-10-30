"""Adaptive controller for planning simulation budgets."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
import torch

from .environment import EnvironmentConfig, PlannerObservation
from .mcts import PlannerSettings


@dataclass
class ThermostatConfig:
    """Configuration for the adaptive simulation thermostat."""

    min_simulations: int = 16
    max_simulations: int = 160
    low_entropy: float = 0.5
    high_entropy: float = 1.35
    budget_pressure_ratio: float = 0.35
    endgame_horizon_ratio: float = 0.8


class PlanningThermostat:
    """Recommend simulation budgets based on entropy and budget pressure."""

    def __init__(
        self,
        config: ThermostatConfig,
        env_config: EnvironmentConfig,
        planner_settings: PlannerSettings,
    ) -> None:
        self.config = config
        self.env_config = env_config
        self.planner_settings = planner_settings

    def recommend(
        self,
        observation: PlannerObservation,
        policy: Iterable[float],
        legal_actions: Iterable[int],
    ) -> int:
        del legal_actions  # only entropy and budget pressure are used
        base = self.planner_settings.num_simulations
        entropy = self._entropy(policy)
        entropy_factor = self._entropy_factor(entropy)
        budget_ratio = observation.budget_remaining / self.env_config.starting_budget
        pressure = self._pressure_factor(budget_ratio, observation.timestep)
        simulations = int(round(base * entropy_factor * pressure))
        simulations = max(self.config.min_simulations, simulations)
        simulations = min(self.config.max_simulations, simulations)
        return simulations

    def _entropy(self, policy: Iterable[float]) -> float:
        if isinstance(policy, torch.Tensor):
            probs = policy.detach().to(dtype=torch.float64, device="cpu")
            probs = probs[probs > 0]
            if probs.numel() == 0:
                return 0.0
            entropy = -(probs * torch.log(probs)).sum()
            return float(entropy.item())

        probs = np.asarray(list(policy), dtype=np.float64)
        probs = probs[probs > 0]
        if probs.size == 0:
            return 0.0
        return float(-np.sum(probs * np.log(probs)))

    def _entropy_factor(self, entropy: float) -> float:
        if entropy <= self.config.low_entropy:
            return 0.7
        if entropy >= self.config.high_entropy:
            return 1.3
        span = self.config.high_entropy - self.config.low_entropy
        if span <= 1e-6:
            return 1.0
        alpha = (entropy - self.config.low_entropy) / span
        return 0.7 + 0.6 * alpha

    def _pressure_factor(self, budget_ratio: float, timestep: int) -> float:
        pressure = 1.0
        if budget_ratio <= self.config.budget_pressure_ratio:
            pressure = max(pressure, 1.3)
        horizon_ratio = timestep / max(self.env_config.horizon, 1)
        if horizon_ratio >= self.config.endgame_horizon_ratio:
            pressure = max(pressure, 1.15)
        return pressure


__all__ = ["PlanningThermostat", "ThermostatConfig"]
