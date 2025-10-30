"""Simulation toolkit for the Huxley–Gödel Machine demo."""

from .runner import parse_overrides, run_cli, run_simulation, SimulationReport, StrategyResult

__all__ = [
    "parse_overrides",
    "run_cli",
    "run_simulation",
    "SimulationReport",
    "StrategyResult",
]
