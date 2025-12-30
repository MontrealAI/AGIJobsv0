"""Simulation interfaces and sample implementations."""

from __future__ import annotations

import math
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

    def _compute_metrics(self) -> Dict[str, float]:
        energy_per_capita = self.energy_output / max(self.population, 1.0)
        compute_per_capita = self.compute_output / max(self.population, 1.0)

        prosperity_index = math.tanh(energy_per_capita * 1e3)
        sustainability_index = math.tanh(compute_per_capita * 1e3)
        innovation_boost = 0.85 + 0.15 * math.tanh(self.innovation_index / 3)
        sustainability_boost = 0.8 + 0.2 * math.tanh(self.innovation_index / 2)
        prosperity_index = min(1.0, max(0.0, prosperity_index * innovation_boost))
        sustainability_index = min(1.0, max(0.0, sustainability_index * sustainability_boost))

        order_parameter = (prosperity_index + sustainability_index) / 2.0
        order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
        entropy = -(
            order_parameter * math.log(order_parameter)
            + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
        )
        coordination_index = 1.0 - abs(prosperity_index - sustainability_index)
        coordination_index = min(1.0, max(0.0, coordination_index))
        temperature = 1.0 + (1.0 - sustainability_index)
        pressure = 1.0 + (1.0 - prosperity_index)
        volume = 1.0 + coordination_index
        internal_energy = (self.energy_output + self.compute_output) / 2_000_000.0
        enthalpy = internal_energy + pressure * volume
        free_energy = internal_energy - temperature * entropy
        gibbs_free_energy = enthalpy - temperature * entropy
        hamiltonian = -internal_energy * order_parameter * (1.0 + 0.1 * math.log1p(self.innovation_index))
        stability_index = math.exp(-entropy) * (0.5 + 0.5 * coordination_index)
        stability_index = min(1.0, max(0.0, stability_index))
        nash_welfare = math.sqrt(max(1e-6, prosperity_index) * max(1e-6, sustainability_index))
        welfare_floor = min(prosperity_index, sustainability_index)
        sentient_welfare_index = 0.55 * nash_welfare + 0.45 * welfare_floor
        game_theory_slack = min(1.0, nash_welfare * (0.6 + 0.4 * coordination_index))
        return {
            "prosperity_index": prosperity_index,
            "sustainability_index": sustainability_index,
            "nash_welfare": nash_welfare,
            "sentient_welfare_index": sentient_welfare_index,
            "free_energy": free_energy,
            "gibbs_free_energy": gibbs_free_energy,
            "entropy": entropy,
            "hamiltonian": hamiltonian,
            "stability_index": stability_index,
            "coordination_index": coordination_index,
            "game_theory_slack": game_theory_slack,
            "temperature": temperature,
            "enthalpy": enthalpy,
            "pressure": pressure,
        }

    def get_state(self) -> Dict[str, float]:
        state = {
            "energy_output": self.energy_output,
            "compute_output": self.compute_output,
            "population": self.population,
            "innovation_index": self.innovation_index,
        }
        state.update(self._compute_metrics())
        return state

    @classmethod
    def from_config(cls, config: Dict[str, float]) -> "SyntheticEconomySim":
        return cls(
            energy_output=float(config.get("energy_output", 1e6)),
            compute_output=float(config.get("compute_output", 1e6)),
            population=float(config.get("population", 1e9)),
            innovation_index=float(config.get("innovation_index", 1.0)),
        )
