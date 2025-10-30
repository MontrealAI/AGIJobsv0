"""Absolute Zero Reasoner Demo package.

This package exposes a production-ready simulation of the Absolute Zero
Reasoner loop customised for the AGI Jobs v0/v2 environment. The modules are
organised to be explicit, auditable and easily adjustable by non-technical
operators.
"""

from .config import DemoConfig
from .orchestrator import AbsoluteZeroDemo

__all__ = ["DemoConfig", "AbsoluteZeroDemo"]
