from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict


class PlanetarySim(ABC):
    @abstractmethod
    def apply_action(self, action: Dict[str, float]) -> Dict[str, float]:
        raise NotImplementedError

    @abstractmethod
    def tick(self, hours: float) -> Dict[str, float]:
        raise NotImplementedError

    @abstractmethod
    def snapshot(self) -> Dict[str, float]:
        raise NotImplementedError


@dataclass
class SyntheticEconomySim(PlanetarySim):
    energy: float
    compute: float
    gdp: float
    innovation_index: float
    history: list[Dict[str, float]] = field(default_factory=list)

    def apply_action(self, action: Dict[str, float]) -> Dict[str, float]:
        energy_delta = action.get("energy_delta", 0.0)
        compute_delta = action.get("compute_delta", 0.0)
        innovation_delta = action.get("innovation_delta", 0.0)
        self.energy = max(0.0, self.energy + energy_delta)
        self.compute = max(0.0, self.compute + compute_delta)
        self.innovation_index = max(0.1, self.innovation_index + innovation_delta)
        self.gdp *= 1 + (self.innovation_index - 1) * 0.02
        snapshot = self.snapshot()
        self.history.append(snapshot)
        return snapshot

    def tick(self, hours: float) -> Dict[str, float]:
        growth_factor = 1 + (self.innovation_index - 1) * hours / 100
        self.energy *= growth_factor
        self.compute *= growth_factor
        self.gdp *= growth_factor
        snapshot = self.snapshot()
        self.history.append(snapshot)
        return snapshot

    def snapshot(self) -> Dict[str, float]:
        return {
            "energy": self.energy,
            "compute": self.compute,
            "gdp": self.gdp,
            "innovation_index": self.innovation_index,
        }


def build_simulation(config: Dict[str, float]) -> PlanetarySim:
    return SyntheticEconomySim(
        energy=float(config.get("initial_energy", 0.0)),
        compute=float(config.get("initial_compute", 0.0)),
        gdp=float(config.get("initial_gdp", 0.0)),
        innovation_index=float(config.get("innovation_index", 1.0)),
    )
