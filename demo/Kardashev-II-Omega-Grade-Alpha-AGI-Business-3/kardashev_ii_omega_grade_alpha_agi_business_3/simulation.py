"""Planetary-scale simulation hooks."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class SimulationState:
    energy_output_gw: float
    population_billions: float
    prosperity_index: float
    sustainability_index: float
    narrative: List[str] = field(default_factory=list)


class PlanetarySimulation:
    """Abstract base for pluggable simulations."""

    def tick(self, hours: int) -> SimulationState:
        raise NotImplementedError

    def apply_action(self, action: Dict[str, float]) -> SimulationState:
        raise NotImplementedError

    def describe(self) -> str:
        raise NotImplementedError


class SyntheticEconomySim(PlanetarySimulation):
    """A lightweight planetary economy simulation."""

    def __init__(self) -> None:
        self._state = SimulationState(
            energy_output_gw=500_000.0,
            population_billions=12.5,
            prosperity_index=0.72,
            sustainability_index=0.61,
            narrative=["Simulation initialized"],
        )

    def tick(self, hours: int) -> SimulationState:
        drift = random.uniform(-0.005, 0.01)
        self._state.energy_output_gw *= 1 + drift
        self._state.prosperity_index = min(1.0, max(0.0, self._state.prosperity_index + drift / 2))
        self._state.sustainability_index = min(1.0, max(0.0, self._state.sustainability_index - drift / 3))
        self._state.narrative.append(f"System evolved over {hours} hours with drift {drift:.3f}")
        return self._state

    def apply_action(self, action: Dict[str, float]) -> SimulationState:
        energy_invest = action.get("build_dyson_increments", 0.0)
        sustainability_push = action.get("sustainability_programs", 0.0)
        prosperity_push = action.get("prosperity_programs", 0.0)
        self._state.energy_output_gw *= 1 + 0.02 * energy_invest
        self._state.sustainability_index = min(1.0, self._state.sustainability_index + 0.03 * sustainability_push)
        self._state.prosperity_index = min(1.0, self._state.prosperity_index + 0.04 * prosperity_push)
        self._state.narrative.append(
            "Action applied: energy=%.2f, sustainability=%.2f, prosperity=%.2f"
            % (energy_invest, sustainability_push, prosperity_push)
        )
        return self._state

    def describe(self) -> str:
        return (
            "Synthetic economy balancing Kardashev-II energy generation, citizen prosperity, "
            "and ecological sustainability."
        )
