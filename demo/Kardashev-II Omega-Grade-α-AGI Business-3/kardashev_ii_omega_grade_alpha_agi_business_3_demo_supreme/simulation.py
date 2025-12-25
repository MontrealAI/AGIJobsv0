"""Planetary simulation hooks for the Supreme demo."""

from __future__ import annotations

import json
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable


@dataclass(slots=True)
class PlanetaryState:
    epoch: float
    population: float
    energy_output: float
    compute_output: float
    stress_index: float
    gibbs_free_energy: float
    entropy: float
    hamiltonian: float
    coordination_index: float
    temperature: float
    narrative: str = ""

    def to_dict(self) -> Dict[str, float | str]:
        return {
            "epoch": self.epoch,
            "population": self.population,
            "energy_output": self.energy_output,
            "compute_output": self.compute_output,
            "stress_index": self.stress_index,
            "gibbs_free_energy": self.gibbs_free_energy,
            "entropy": self.entropy,
            "hamiltonian": self.hamiltonian,
            "coordination_index": self.coordination_index,
            "temperature": self.temperature,
            "narrative": self.narrative,
        }


class PlanetarySim:
    """Abstract interface for planetary simulation backends."""

    def apply_action(self, action: Dict[str, float]) -> PlanetaryState:
        raise NotImplementedError

    def get_state(self) -> PlanetaryState:
        raise NotImplementedError


@dataclass
class SyntheticEconomySim(PlanetarySim):
    """Minimal synthetic economy simulation."""

    population: float = 8_000_000_000
    energy_output: float = 1_000_000.0
    compute_output: float = 5_000_000.0
    stress_index: float = 0.1
    event_log: Iterable[str] = field(default_factory=list)
    log_path: Path = Path("./omega_simulation_log.jsonl")

    def apply_action(self, action: Dict[str, float]) -> PlanetaryState:
        population_delta = action.get("population", 0.0)
        energy_delta = action.get("energy", 0.0)
        compute_delta = action.get("compute", 0.0)
        resilience_delta = action.get("resilience", 0.0)
        self.population = max(0.0, self.population + population_delta)
        self.energy_output = max(0.0, self.energy_output + energy_delta)
        self.compute_output = max(0.0, self.compute_output + compute_delta)
        self.stress_index = max(0.0, min(1.0, self.stress_index - resilience_delta + random.random() * 0.02))
        metrics = self._compute_thermodynamic_metrics()
        narrative = self._build_narrative(action)
        state = PlanetaryState(
            epoch=time.time(),
            population=self.population,
            energy_output=self.energy_output,
            compute_output=self.compute_output,
            stress_index=self.stress_index,
            gibbs_free_energy=metrics["gibbs_free_energy"],
            entropy=metrics["entropy"],
            hamiltonian=metrics["hamiltonian"],
            coordination_index=metrics["coordination_index"],
            temperature=metrics["temperature"],
            narrative=narrative,
        )
        self._write_state(state)
        return state

    def get_state(self) -> PlanetaryState:
        metrics = self._compute_thermodynamic_metrics()
        return PlanetaryState(
            epoch=time.time(),
            population=self.population,
            energy_output=self.energy_output,
            compute_output=self.compute_output,
            stress_index=self.stress_index,
            gibbs_free_energy=metrics["gibbs_free_energy"],
            entropy=metrics["entropy"],
            hamiltonian=metrics["hamiltonian"],
            coordination_index=metrics["coordination_index"],
            temperature=metrics["temperature"],
            narrative="Status checkpoint",
        )

    def _write_state(self, state: PlanetaryState) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(state.to_dict()) + "\n")

    @staticmethod
    def _build_narrative(action: Dict[str, float]) -> str:
        segments = []
        if action.get("energy", 0.0) > 0:
            segments.append("Stellar energy harnessed via orbital arrays.")
        if action.get("compute", 0.0) > 0:
            segments.append("Quantum compute lattices expanded.")
        if action.get("population", 0.0) != 0:
            segments.append("Demographic dynamics recalibrated by AGI guidance.")
        if action.get("resilience", 0.0) > 0:
            segments.append("Planetary resilience frameworks fortified.")
        if not segments:
            segments.append("Steady-state optimization underway.")
        return " ".join(segments)

    def _compute_thermodynamic_metrics(self) -> dict[str, float]:
        order_parameter = 1.0 - self.stress_index
        order_parameter = min(1.0 - 1e-6, max(1e-6, order_parameter))
        entropy = -(
            order_parameter * math.log(order_parameter)
            + (1.0 - order_parameter) * math.log(1.0 - order_parameter)
        )
        temperature = 1.0 + self.stress_index
        internal_energy = (self.energy_output / 1_000_000.0) + (self.compute_output / 2_000_000.0)
        gibbs_free_energy = internal_energy - temperature * entropy
        hamiltonian = -internal_energy * order_parameter
        total_output = self.energy_output + self.compute_output
        if total_output <= 0:
            coordination_index = 1.0
        else:
            balance = self.energy_output / total_output
            coordination_index = 1.0 - abs(balance - 0.5) * 2.0
            coordination_index = min(1.0, max(0.0, coordination_index))
        return {
            "gibbs_free_energy": gibbs_free_energy,
            "entropy": entropy,
            "hamiltonian": hamiltonian,
            "coordination_index": coordination_index,
            "temperature": temperature,
        }


__all__ = ["PlanetarySim", "PlanetaryState", "SyntheticEconomySim"]
