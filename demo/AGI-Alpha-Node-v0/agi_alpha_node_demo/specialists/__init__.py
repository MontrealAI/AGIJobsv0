"""Specialist registry."""

from __future__ import annotations

from typing import Dict

from .base import Specialist
from .biotech import BiotechSynthesist
from .finance import FinanceStrategist
from .manufacturing import ManufacturingOptimizer


class SpecialistRegistry:
    def __init__(self) -> None:
        self._specialists: Dict[str, Specialist] = {
            "finance": FinanceStrategist(),
            "biotech": BiotechSynthesist(),
            "manufacturing": ManufacturingOptimizer(),
        }

    def get(self, name: str) -> Specialist:
        try:
            return self._specialists[name]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise KeyError(f"Unknown specialist: {name}") from exc

    def names(self) -> Dict[str, Specialist]:
        return dict(self._specialists)
