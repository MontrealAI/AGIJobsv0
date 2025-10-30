"""AlphaEvolve demo package for AGI Jobs v0 (v2).

This package provides a production-grade, sandboxed evolutionary controller
inspired by Novikov et al. (2025).
"""

from .config import AlphaEvolveConfig, load_config
from .controller import AlphaEvolveController
from .evaluator import EvaluationHarness
from .program_db import ProgramAtlas

__all__ = [
    "AlphaEvolveConfig",
    "load_config",
    "AlphaEvolveController",
    "EvaluationHarness",
    "ProgramAtlas",
]
