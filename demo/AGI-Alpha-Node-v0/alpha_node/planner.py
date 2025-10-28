"""MuZero-inspired planner implementation."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .knowledge import KnowledgeLake
from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class Plan:
    job_id: str
    strategy: str
    expected_value: float
    horizon: int


class MuZeroPlanner:
    """Simplified MuZero-style planner for the demo."""

    def __init__(
        self,
        horizon: int,
        exploration_bias: float,
        knowledge: KnowledgeLake,
    ) -> None:
        self.horizon = horizon
        self.exploration_bias = exploration_bias
        self.knowledge = knowledge
        self.value_cache: Dict[str, float] = {}

    def plan(self, job_id: str, domain: str, options: Iterable[str]) -> Plan:
        prior = self._prior_from_knowledge(domain)
        best_option, best_score = None, float("-inf")
        for option in options:
            simulation_score = self._simulate(job_id, option, prior)
            LOGGER.debug(
                "Planner simulation | job=%s option=%s score=%s", job_id, option, simulation_score
            )
            if simulation_score > best_score:
                best_option, best_score = option, simulation_score
        if best_option is None:
            raise ValueError("Planner received an empty option set")
        plan = Plan(job_id=job_id, strategy=best_option, expected_value=best_score, horizon=self.horizon)
        self.value_cache[job_id] = best_score
        LOGGER.info("Planner decision | job=%s strategy=%s value=%.2f", job_id, best_option, best_score)
        return plan

    def _prior_from_knowledge(self, domain: str) -> float:
        records = self.knowledge.search(domain)
        if not records:
            return 0.0
        average = sum(record.reward_delta for record in records) / len(records)
        LOGGER.debug("Planner prior | domain=%s prior=%.2f", domain, average)
        return average

    def _simulate(self, job_id: str, option: str, prior: float) -> float:
        random.seed(hash((job_id, option)) & 0xFFFFFFFF)
        expectation = prior
        for depth in range(self.horizon):
            exploitation = expectation + random.random()
            exploration = self.exploration_bias * math.sqrt(depth + 1)
            expectation = expectation + 0.5 * (exploitation + exploration)
        return expectation


__all__ = ["MuZeroPlanner", "Plan"]
