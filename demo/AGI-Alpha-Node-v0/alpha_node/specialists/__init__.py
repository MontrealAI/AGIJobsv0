"""Specialist agent registry and factory helpers."""
from __future__ import annotations

from typing import Dict

from ..knowledge import KnowledgeLake
from .base import BaseSpecialist, SpecialistResult
from .finance import FinanceStrategist
from .biotech import BiotechSynthesist
from .manufacturing import ManufacturingOptimizer

_REGISTRY: Dict[str, type[BaseSpecialist]] = {
    "finance": FinanceStrategist,
    "biotech": BiotechSynthesist,
    "manufacturing": ManufacturingOptimizer,
}


def build_specialist(domain: str, knowledge: KnowledgeLake) -> BaseSpecialist:
    """Instantiate a specialist for the requested domain."""

    key = domain.lower()
    try:
        specialist_cls = _REGISTRY[key]
    except KeyError as exc:  # pragma: no cover - defensive path
        raise ValueError(f"Unsupported specialist domain: {domain}") from exc
    specialist = specialist_cls(knowledge)
    return specialist


__all__ = [
    "BaseSpecialist",
    "SpecialistResult",
    "FinanceStrategist",
    "BiotechSynthesist",
    "ManufacturingOptimizer",
    "build_specialist",
]
