"""Planetary simulation hooks for the Supreme demo."""

from __future__ import annotations

import json
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
    narrative: str = ""

    def to_dict(self) -> Dict[str, float | str]:
        return {
            "epoch": self.epoch,
            "population": self.population,
            "energy_output": self.energy_output,
            "compute_output": self.compute_output,
            "stress_index": self.stress_index,
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
        narrative = self._build_narrative(action)
        state = PlanetaryState(
            epoch=time.time(),
            population=self.population,
            energy_output=self.energy_output,
            compute_output=self.compute_output,
            stress_index=self.stress_index,
            narrative=narrative,
        )
        self._write_state(state)
        return state

    def get_state(self) -> PlanetaryState:
        return PlanetaryState(
            epoch=time.time(),
            population=self.population,
            energy_output=self.energy_output,
            compute_output=self.compute_output,
            stress_index=self.stress_index,
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
        return " " .join(segments)


__all__ = ["PlanetarySim", "PlanetaryState", "SyntheticEconomySim"]
