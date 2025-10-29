"""Thermostat control plane for the HGM orchestrator."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
HGM_CORE_SRC = ROOT / "packages" / "hgm-core" / "src"
if str(HGM_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(HGM_CORE_SRC))

from .controller import ThermostatAdjustment, ThermostatConfig, ThermostatController
from .metrics import MetricSample

__all__ = [
    "MetricSample",
    "ThermostatAdjustment",
    "ThermostatConfig",
    "ThermostatController",
]
