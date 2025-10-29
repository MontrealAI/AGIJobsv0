"""Utilities for cumulative metric propagation (CMP).

CMP is represented as a running average enhanced with precision information.
This module exposes a :class:`CMPAggregate` accumulator that can be merged
across the tree to compute consistent roll-ups for orchestrator dashboards.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(slots=True)
class CMPAggregate:
    """Aggregated statistics describing a stream of scalar rewards.

    The aggregate keeps track of weighted observations and exposes derived
    metrics that are numerically stable even for large hierarchies.
    """

    total_weight: float = 0.0
    weighted_sum: float = 0.0
    weighted_squared_sum: float = 0.0

    def add(self, value: float, weight: float = 1.0) -> None:
        """Consume a new observation.

        Args:
            value: Reward value to incorporate.
            weight: Optional importance weight. Defaults to ``1.0``.
        """

        if weight <= 0:
            raise ValueError("CMP weights must be positive")
        self.total_weight += weight
        self.weighted_sum += value * weight
        self.weighted_squared_sum += (value * value) * weight

    def merge(self, other: "CMPAggregate") -> "CMPAggregate":
        """Combine another aggregate into this one and return ``self``."""

        self.total_weight += other.total_weight
        self.weighted_sum += other.weighted_sum
        self.weighted_squared_sum += other.weighted_squared_sum
        return self

    @property
    def mean(self) -> float:
        """Return the weighted mean of the observed rewards."""

        if self.total_weight == 0:
            return 0.0
        return self.weighted_sum / self.total_weight

    @property
    def variance(self) -> float:
        """Return the (population) variance for the observed rewards."""

        if self.total_weight == 0:
            return 0.0
        mean = self.mean
        return max(
            0.0,
            (self.weighted_squared_sum / self.total_weight) - (mean * mean),
        )

    def to_dict(self) -> dict[str, float]:
        """Serialize the aggregate to a JSON friendly dictionary."""

        return {
            "weight": self.total_weight,
            "mean": self.mean,
            "variance": self.variance,
        }


def aggregate_cmp(values: Sequence[float], weights: Sequence[float] | None = None) -> CMPAggregate:
    """Aggregate a batch of rewards into a :class:`CMPAggregate`.

    Args:
        values: Sequence of scalar reward values.
        weights: Optional per-value weights. When omitted, ``1.0`` is assumed
            for each observation.
    """

    aggregate = CMPAggregate()
    if weights is None:
        for value in values:
            aggregate.add(value)
    else:
        if len(values) != len(weights):
            raise ValueError("Values and weights must share the same length")
        for value, weight in zip(values, weights):
            aggregate.add(value, weight)
    return aggregate


def merge_cmp_aggregates(aggregates: Iterable[CMPAggregate]) -> CMPAggregate:
    """Merge a collection of :class:`CMPAggregate` instances into one."""

    total_weight = 0.0
    weighted_sum = 0.0
    weighted_squared_sum = 0.0
    for aggregate in aggregates:
        total_weight += aggregate.total_weight
        weighted_sum += aggregate.weighted_sum
        weighted_squared_sum += aggregate.weighted_squared_sum
    return CMPAggregate(total_weight, weighted_sum, weighted_squared_sum)
