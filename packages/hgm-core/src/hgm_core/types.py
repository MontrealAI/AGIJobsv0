"""Shared dataclasses used by the HGM core engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from .cmp import CMPAggregate


@dataclass(slots=True)
class AgentNode:
    """Node tracked by the :class:`~hgm_core.engine.HGMEngine`.

    Attributes:
        key: Stable identifier for the node.
        parent: Optional identifier of the parent node.
        visits: Number of evaluation calls processed for this node.
        success_weight: Aggregated success mass for Thompson sampling.
        failure_weight: Aggregated failure mass for Thompson sampling.
        cmp: Aggregated metrics for CMP propagation.
        metadata: Arbitrary payload forwarded by orchestrators.
    """

    key: str
    parent: str | None = None
    visits: float = 0.0
    success_weight: float = 0.0
    failure_weight: float = 0.0
    cmp: CMPAggregate = field(default_factory=CMPAggregate)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def record_reward(self, reward: float, weight: float = 1.0) -> None:
        """Update Thompson sampling weights and CMP aggregates.

        Args:
            reward: Normalised reward in ``[0, 1]``.
            weight: Optional importance weight. Defaults to ``1.0``.
        """

        if not 0.0 <= reward <= 1.0:
            raise ValueError("Rewards must lie within [0, 1]")
        if weight <= 0:
            raise ValueError("Weights must be positive")
        self.visits += weight
        self.success_weight += reward * weight
        self.failure_weight += (1.0 - reward) * weight
        self.cmp.add(reward, weight)

    def as_dict(self) -> Dict[str, Any]:
        """Serialize the node to a JSON compatible structure."""

        return {
            "key": self.key,
            "parent": self.parent,
            "visits": self.visits,
            "success_weight": self.success_weight,
            "failure_weight": self.failure_weight,
            "cmp": self.cmp.to_dict(),
            "metadata": self.metadata,
        }
