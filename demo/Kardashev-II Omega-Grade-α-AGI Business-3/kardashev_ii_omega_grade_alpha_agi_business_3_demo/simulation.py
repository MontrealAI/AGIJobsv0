"""Planetary scale simulation stubs for demonstration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class SimulationState:
    energy_output_gw: float
    prosperity_index: float
    sustainability_index: float


class PlanetarySimulation:
    """Interface for world simulators."""

    def tick(self, hours: float) -> SimulationState:  # pragma: no cover - abstract
        raise NotImplementedError


class SyntheticEconomySim(PlanetarySimulation):
    """Simple synthetic economy simulation."""

    def __init__(self) -> None:
        self.energy_output_gw = 500_000.0
        self.prosperity_index = 0.7
        self.sustainability_index = 0.6

    def apply_action(self, action: Dict[str, float]) -> None:
        self.energy_output_gw += action.get("build_dyson_nodes", 0.0) * 10_000
        self.prosperity_index = min(1.0, self.prosperity_index + action.get("stimulus", 0.0) * 0.01)
        self.sustainability_index = min(1.0, self.sustainability_index + action.get("green_shift", 0.0) * 0.02)

    def tick(self, hours: float) -> SimulationState:
        drift = hours / 24
        self.energy_output_gw *= 1.0 + 0.0001 * drift
        self.prosperity_index = min(1.0, self.prosperity_index + 0.0005 * drift)
        self.sustainability_index = min(1.0, self.sustainability_index + 0.0004 * drift)
        return SimulationState(
            energy_output_gw=self.energy_output_gw,
            prosperity_index=self.prosperity_index,
            sustainability_index=self.sustainability_index,
        )

