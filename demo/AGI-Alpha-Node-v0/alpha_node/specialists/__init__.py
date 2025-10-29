"""Specialist agent registry."""
from .base import BaseSpecialist, SpecialistResult
from .finance import FinanceStrategist
from .biotech import BiotechSynthesist
from .manufacturing import ManufacturingOptimizer

__all__ = [
    "BaseSpecialist",
    "SpecialistResult",
    "FinanceStrategist",
    "BiotechSynthesist",
    "ManufacturingOptimizer",
]
