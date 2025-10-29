"""High-level exports for the Huxley–Gödel Machine demo package."""
from .simulation import (
    DemoComparison,
    StrategyOutcome,
    run_baseline_simulation,
    run_comparison,
    run_hgm_simulation,
)

__all__ = [
    "DemoComparison",
    "StrategyOutcome",
    "run_baseline_simulation",
    "run_comparison",
    "run_hgm_simulation",
]
