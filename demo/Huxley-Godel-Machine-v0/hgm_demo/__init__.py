"""Public entry points for the Huxley–Gödel Machine demo."""

from .config import DemoConfig, load_config
from .engine import HGMEngine
from .orchestrator import Orchestrator
from .persistence import Persistence
from .sentinel import Sentinel
from .simulation import Simulator
from .thermostat import Thermostat

__all__ = [
    "DemoConfig",
    "HGMEngine",
    "Orchestrator",
    "Persistence",
    "Sentinel",
    "Simulator",
    "Thermostat",
    "load_config",
]

