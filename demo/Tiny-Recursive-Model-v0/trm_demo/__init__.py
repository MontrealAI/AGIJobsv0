"""Tiny Recursive Model Demo package for AGI Jobs v0 (v2).

This package bundles a production-grade yet user-friendly implementation of a
Tiny Recursive Model (TRM) together with supporting economic orchestration
components used throughout the demo experience.  Everything is exposed through
high-level APIs and a CLI so that non-technical operators can harness
state-of-the-art recursive reasoning with minimal setup.
"""

from .config import TinyRecursiveModelConfig
from .engine import TRMEngine, TRMInferenceResult
from .ledger import EconomicLedger
from .thermostat import Thermostat
from .sentinel import Sentinel
from .simulation import DemoMetrics, run_conversion_simulation

__all__ = [
    "TinyRecursiveModelConfig",
    "TRMEngine",
    "TRMInferenceResult",
    "EconomicLedger",
    "Thermostat",
    "Sentinel",
    "DemoMetrics",
    "run_conversion_simulation",
]
