"""Import proxy that exposes the simulator package without hyphenated paths."""
from __future__ import annotations

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_LEGACY_DIR = _PROJECT_ROOT / "Huxley-Godel-Machine-v0" / "simulator"
_SRC_DIR = _PROJECT_ROOT / "Huxley-Godel-Machine-v0" / "src"

if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))


def _load_legacy_module(name: str):
    spec = spec_from_file_location(f"{__name__}.{name}", _LEGACY_DIR / f"{name}.py")
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to locate simulator module: {name}")
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_runner = _load_legacy_module("runner")

StrategyResult = _runner.StrategyResult
SimulationReport = _runner.SimulationReport
run_simulation = _runner.run_simulation
run_cli = _runner.run_cli
parse_overrides = _runner.parse_overrides

__all__ = [
    "StrategyResult",
    "SimulationReport",
    "run_simulation",
    "run_cli",
    "parse_overrides",
]
