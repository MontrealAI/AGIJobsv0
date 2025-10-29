"""Core primitives for hierarchical generative modeling engines.

This package exposes the :class:`~hgm_core.engine.HGMEngine` used by
higher level orchestrators alongside helper utilities for Thompson sampling
and cumulative metric propagation (CMP).
"""

from .config import EngineConfig
from .engine import HGMEngine
from .sampling import ThompsonSampler
from .types import AgentNode
from .cmp import CMPAggregate, aggregate_cmp, merge_cmp_aggregates

__all__ = [
    "EngineConfig",
    "HGMEngine",
    "ThompsonSampler",
    "AgentNode",
    "CMPAggregate",
    "aggregate_cmp",
    "merge_cmp_aggregates",
]
