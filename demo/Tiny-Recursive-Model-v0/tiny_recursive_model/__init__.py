"""Tiny Recursive Model demo package."""

from .config import DemoConfig
from .engine import TinyRecursiveModelEngine
from .economic import EconomicLedger
from .thermostat import ThermostatController
from .sentinel import Sentinel
from .orchestrator import DemoOrchestrator

__all__ = [
    "DemoConfig",
    "TinyRecursiveModelEngine",
    "EconomicLedger",
    "ThermostatController",
    "Sentinel",
    "DemoOrchestrator",
]
