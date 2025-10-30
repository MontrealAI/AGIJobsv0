"""AGIJobs Day-One Utility Benchmark demo scaffold."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_module_path = Path(__file__).with_name("demo_runner.py")
_spec = importlib.util.spec_from_file_location("agi_jobs_day_one_utility_demo_runner", _module_path)
if _spec is None or _spec.loader is None:  # pragma: no cover - defensive guard
    raise ImportError("Unable to locate demo_runner module")
_module = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _module
_spec.loader.exec_module(_module)  # type: ignore[arg-type]

DayOneUtilityOrchestrator = _module.DayOneUtilityOrchestrator
StrategyNotFoundError = _module.StrategyNotFoundError
DemoPausedError = getattr(_module, "DemoPausedError", RuntimeError)

sys.modules.setdefault("demo_runner", _module)

__all__ = [
    "DayOneUtilityOrchestrator",
    "StrategyNotFoundError",
    "DemoPausedError",
]
