"""Tiny Recursive Model demo package."""

from .engine import TinyRecursiveModel, TinyRecursiveModelConfig, TinyRecursiveModelResult
from .simulation import ConversionSimulation, SimulationConfig, SimulationOutcome
from .economic import EconomicLedger
from .thermostat import Thermostat, ThermostatConfig
from .sentinel import Sentinel, SentinelConfig
from .subgraph import SubgraphLogger, SubgraphConfig
from .reporting import build_report, write_report

__all__ = [
    "TinyRecursiveModel",
    "TinyRecursiveModelConfig",
    "TinyRecursiveModelResult",
    "ConversionSimulation",
    "SimulationConfig",
    "SimulationOutcome",
    "EconomicLedger",
    "Thermostat",
    "ThermostatConfig",
    "Sentinel",
    "SentinelConfig",
    "SubgraphLogger",
    "SubgraphConfig",
    "build_report",
    "write_report",
]
