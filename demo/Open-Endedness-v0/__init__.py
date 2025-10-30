"""Open-endedness via Models of human Notions of Interestingness demo package."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_MODULE_DIR = Path(__file__).resolve().parent


def _load(name: str):
    path = _MODULE_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"demo.open_endedness_v0.{name}", path)
    if spec is None or spec.loader is None:  # pragma: no cover - defensive
        raise ImportError(f"Unable to load module {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, module)
    spec.loader.exec_module(module)
    return module


_ledger = _load("ledger")
_engine = _load("omni_engine")
_thermostat = _load("thermostat")
_sentinel = _load("sentinel")
_config_utils = _load("config_utils")

EconomicLedger = _ledger.EconomicLedger
OmniCurriculumEngine = _engine.OmniCurriculumEngine
ModelOfInterestingness = _engine.ModelOfInterestingness
EconomicSnapshot = _thermostat.EconomicSnapshot
ThermostatController = _thermostat.ThermostatController
Sentinel = _sentinel.Sentinel
SentinelConfig = _sentinel.SentinelConfig
load_config = _config_utils.load_config
summarise_config = _config_utils.summarise
set_config_value = _config_utils.set_config_value

__all__ = [
    "EconomicLedger",
    "OmniCurriculumEngine",
    "ModelOfInterestingness",
    "EconomicSnapshot",
    "ThermostatController",
    "Sentinel",
    "SentinelConfig",
    "load_config",
    "summarise_config",
    "set_config_value",
]
