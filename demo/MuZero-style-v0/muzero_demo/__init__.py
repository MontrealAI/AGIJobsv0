"""MuZero-style planning demo package for AGI Jobs v0 (v2).

This package exposes ergonomic helpers for running a compact yet
production-grade MuZero-style planning workflow tailored to
AGI Jobs economics.  The modules are intentionally lightweight so
non-technical operators can introspect and extend the system easily.
"""

from . import environment, mcts, network, baselines, training, evaluation

__all__ = [
    "environment",
    "mcts",
    "network",
    "baselines",
    "training",
    "evaluation",
]
