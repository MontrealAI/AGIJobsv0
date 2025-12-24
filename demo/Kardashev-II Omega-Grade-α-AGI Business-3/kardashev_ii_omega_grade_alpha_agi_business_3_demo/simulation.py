"""Planetary scale simulation stubs for demonstration."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict


@dataclass
class SimulationState:
    energy_output_gw: float
    prosperity_index: float
    sustainability_index: float
    free_energy: float = 0.0
    entropy: float = 0.0
    hamiltonian: float = 0.0
    coordination_index: float = 0.0


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

    def _compute_thermodynamic_metrics(self) -> dict[str, float]:
        """Compute free-energy inspired metrics for the simulated economy."""

        order_parameter = (self.prosperity_index + self.sustainability_index) / 2.0
        order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
        entropy = -(
            order_parameter * math.log(order_parameter)
            + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
        )
        temperature = 1.0 + (1.0 - self.sustainability_index)
        internal_energy = self.energy_output_gw / 1_000_000.0
        free_energy = internal_energy - temperature * entropy
        hamiltonian = -internal_energy * order_parameter
        coordination_index = 1.0 - abs(self.prosperity_index - self.sustainability_index)
        coordination_index = min(1.0, max(0.0, coordination_index))
        return {
            "free_energy": free_energy,
            "entropy": entropy,
            "hamiltonian": hamiltonian,
            "coordination_index": coordination_index,
        }

    def tick(self, hours: float) -> SimulationState:
        drift = hours / 24
        self.energy_output_gw *= 1.0 + 0.0001 * drift
        self.prosperity_index = min(1.0, self.prosperity_index + 0.0005 * drift)
        self.sustainability_index = min(1.0, self.sustainability_index + 0.0004 * drift)
        metrics = self._compute_thermodynamic_metrics()
        return SimulationState(
            energy_output_gw=self.energy_output_gw,
            prosperity_index=self.prosperity_index,
            sustainability_index=self.sustainability_index,
            free_energy=metrics["free_energy"],
            entropy=metrics["entropy"],
            hamiltonian=metrics["hamiltonian"],
            coordination_index=metrics["coordination_index"],
        )
