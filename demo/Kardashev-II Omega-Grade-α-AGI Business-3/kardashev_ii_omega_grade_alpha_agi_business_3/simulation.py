"""Planetary-scale simulation hooks."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping

from .logging_utils import log_json
import logging

logger = logging.getLogger(__name__)


class PlanetarySim:
    """Abstract base class for plug-and-play world simulations."""

    def apply_action(self, action: Mapping[str, Any]) -> Mapping[str, Any]:  # pragma: no cover - interface method
        raise NotImplementedError

    def get_state(self) -> Mapping[str, Any]:  # pragma: no cover - interface method
        raise NotImplementedError

    def tick(self, hours: float) -> Mapping[str, Any]:  # pragma: no cover - interface method
        raise NotImplementedError


@dataclass
class SyntheticEconomySim(PlanetarySim):
    """A tiny planetary economy model to illustrate the extension points."""

    energy_capacity: float = 1_000.0
    compute_capacity: float = 100.0
    population_billions: float = 12.0
    gdp_quadrillions: float = 140.0
    telemetry: Dict[str, Any] = field(default_factory=dict)

    def apply_action(self, action: Mapping[str, Any]) -> Mapping[str, Any]:
        kind = action.get("type")
        magnitude = float(action.get("magnitude", 0.0))
        if kind == "build_solar":
            self.energy_capacity += magnitude * 5
            self.gdp_quadrillions += magnitude * 0.2
        elif kind == "expand_compute":
            self.compute_capacity += magnitude * 2
            self.gdp_quadrillions += magnitude * 0.5
        elif kind == "population_policy":
            self.population_billions += magnitude * 0.1
        log_json(logger, "simulation_action", action=dict(action))
        return self.get_state()

    def get_state(self) -> Mapping[str, Any]:
        snapshot = {
            "energy_capacity": self.energy_capacity,
            "compute_capacity": self.compute_capacity,
            "population_billions": self.population_billions,
            "gdp_quadrillions": self.gdp_quadrillions,
        }
        snapshot.update(self.telemetry)
        return snapshot

    def tick(self, hours: float) -> Mapping[str, Any]:
        growth_factor = 1 + hours / (24 * 365)
        self.gdp_quadrillions *= growth_factor
        self.telemetry["last_tick_hours"] = hours
        log_json(logger, "simulation_tick", hours=hours, gdp=self.gdp_quadrillions)
        return self.get_state()
