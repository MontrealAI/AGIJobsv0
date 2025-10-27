"""Simulation interfaces and sample implementations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


class PlanetarySim:
    """Abstract base class for world simulators."""

    def apply_action(self, action: Dict[str, float]) -> Dict[str, float]:  # pragma: no cover - abstract hook
        raise NotImplementedError

    def get_state(self) -> Dict[str, float]:  # pragma: no cover - abstract hook
        raise NotImplementedError


@dataclass(slots=True)
class SyntheticEconomySim(PlanetarySim):
    """Toy simulation modelling energy production and compute supply."""

    energy_output: float
    compute_output: float
    population: float
    innovation_index: float = 1.0
    history: list[Dict[str, float]] = field(default_factory=list)

    def apply_action(self, action: Dict[str, float]) -> Dict[str, float]:
        delta_energy = action.get("build_solar", 0.0) * 10
        delta_compute = action.get("deploy_data_centers", 0.0) * 5
        r_and_d = action.get("invest_in_research", 0.0)
        self.energy_output += delta_energy
        self.compute_output += delta_compute
        self.innovation_index += r_and_d * 0.01
        self.population *= 1 + min(action.get("population_growth", 0.0), 0.05)
        snapshot = self.get_state()
        snapshot.update({"delta_energy": delta_energy, "delta_compute": delta_compute})
        self.history.append(snapshot)
        return snapshot

    def get_state(self) -> Dict[str, float]:
        return {
            "energy_output": self.energy_output,
            "compute_output": self.compute_output,
            "population": self.population,
            "innovation_index": self.innovation_index,
        }

    @classmethod
    def from_config(cls, config: Dict[str, float]) -> "SyntheticEconomySim":
        return cls(
            energy_output=float(config.get("energy_output", 1e6)),
            compute_output=float(config.get("compute_output", 1e6)),
            population=float(config.get("population", 1e9)),
            innovation_index=float(config.get("innovation_index", 1.0)),
        )

