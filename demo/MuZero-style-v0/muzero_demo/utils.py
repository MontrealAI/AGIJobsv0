"""Utility helpers shared across the MuZero-style demo modules."""
from __future__ import annotations

from typing import Iterable, List


def discounted_returns(rewards: Iterable[float], discount: float) -> List[float]:
    r"""Compute discounted returns for every starting index in ``rewards``.

    Parameters
    ----------
    rewards:
        Iterable of immediate rewards observed in an episode.
    discount:
        Discount factor :math:`\gamma` applied multiplicatively at each step.

    Returns
    -------
    list of float
        ``returns[i]`` contains the discounted return when starting from
        ``rewards[i]``.  The helper is deterministic and free from PyTorch
        dependencies so it can be reused inside tests and safety sentinels.
    """

    rewards_list = list(rewards)
    returns: List[float] = []
    length = len(rewards_list)
    for start in range(length):
        total = 0.0
        weight = 1.0
        for index in range(start, length):
            total += weight * float(rewards_list[index])
            weight *= discount
        returns.append(total)
    return returns


__all__ = ["discounted_returns"]
