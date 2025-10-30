"""High-level exports for the Huxley–Gödel Machine demo package."""
from __future__ import annotations

from pathlib import Path
import sys

_SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

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
