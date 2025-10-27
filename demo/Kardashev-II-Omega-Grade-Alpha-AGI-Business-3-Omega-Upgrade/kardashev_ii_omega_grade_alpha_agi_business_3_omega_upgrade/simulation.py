"""Synthetic planetary simulations for the omega upgrade."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class SimulationState:
    energy_output_gw: float
    prosperity_index: float
    sustainability_index: float
    dyson_completion: float


class PlanetarySimulation:
    """Abstract base class for planetary simulations."""

    def tick(self, hours: int) -> SimulationState:
        raise NotImplementedError

    def apply_action(self, action: Dict[str, float]) -> None:
        raise NotImplementedError


class SyntheticEconomySim(PlanetarySimulation):
    """Minimal Dyson swarm economic simulation."""

    def __init__(self) -> None:
        self._energy_output = 120_000.0
        self._prosperity = 0.78
        self._sustainability = 0.82
        self._dyson_completion = 0.42

    def tick(self, hours: int) -> SimulationState:
        multiplier = hours / 24
        self._energy_output *= 1.001 + 0.0005 * multiplier
        self._prosperity = min(1.0, self._prosperity + 0.0008 * multiplier)
        self._sustainability = min(1.0, self._sustainability + 0.0005 * multiplier)
        self._dyson_completion = min(1.0, self._dyson_completion + 0.001 * multiplier)
        return SimulationState(
            energy_output_gw=self._energy_output,
            prosperity_index=self._prosperity,
            sustainability_index=self._sustainability,
            dyson_completion=self._dyson_completion,
        )

    def apply_action(self, action: Dict[str, float]) -> None:
        energy_delta = action.get("energy", 0.0)
        sustainability_delta = action.get("sustainability", 0.0)
        if energy_delta:
            self._energy_output += energy_delta
        if sustainability_delta:
            self._sustainability = min(1.0, max(0.0, self._sustainability + sustainability_delta))
