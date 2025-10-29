"""MuZero-inspired planner for AGI Alpha Node demo."""
from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .knowledge import KnowledgeLake

_LOGGER = logging.getLogger(__name__)


@dataclass
class PlanCandidate:
    job_id: str
    expected_reward: float
    risk_score: float
    description: str


@dataclass
class PlannerStats:
    simulations: int
    best_reward: float
    best_job_id: Optional[str]


class MuZeroPlanner:
    """Simplified MuZero++ planner with tree-search heuristics."""

    def __init__(self, depth: int, exploration_constant: float, learning_rate: float, knowledge: KnowledgeLake) -> None:
        self._depth = depth
        self._exploration_constant = exploration_constant
        self._learning_rate = learning_rate
        self._knowledge = knowledge
        self._value_memory: Dict[str, float] = {}

    def propose(self, jobs: Iterable[Dict[str, float]], simulations: int = 32) -> PlanCandidate:
        best_candidate: Optional[PlanCandidate] = None
        best_value = -math.inf
        stats = PlannerStats(simulations=simulations, best_reward=-math.inf, best_job_id=None)

        jobs_list = list(jobs)
        if not jobs_list:
            raise ValueError("Planner requires at least one job to evaluate")

        for simulation in range(simulations):
            job = random.choice(jobs_list)
            job_id = job["job_id"]
            prior = self._value_memory.get(job_id, job.get("base_reward", 0.0))
            noise = random.uniform(-0.05, 0.1)
            exploration_bonus = self._exploration_constant * math.sqrt(math.log(simulation + 2))
            projected_reward = prior * (1 + noise) + exploration_bonus
            risk_penalty = job.get("risk", 0.0) * random.uniform(0.8, 1.2)
            value = projected_reward - risk_penalty
            _LOGGER.debug(
                "Planner simulation",
                extra={
                    "simulation": simulation,
                    "job_id": job_id,
                    "projected_reward": projected_reward,
                    "risk_penalty": risk_penalty,
                    "value": value,
                },
            )
            if value > best_value:
                best_value = value
                best_candidate = PlanCandidate(
                    job_id=job_id,
                    expected_reward=max(projected_reward - risk_penalty, 0.0),
                    risk_score=risk_penalty,
                    description=job.get("description", ""),
                )
                stats.best_reward = best_candidate.expected_reward
                stats.best_job_id = job_id

        if best_candidate is None:
            raise RuntimeError("Planner failed to select a candidate job")

        self._update_value_memory(best_candidate)
        self._knowledge.record(
            topic="planner",
            content=f"Selected job {best_candidate.job_id} with reward {best_candidate.expected_reward:.4f}",
            tags=["planner", "decision"],
            confidence=0.9,
        )
        _LOGGER.info(
            "Planner selection complete",
            extra={
                "best_job_id": best_candidate.job_id,
                "expected_reward": best_candidate.expected_reward,
                "risk_score": best_candidate.risk_score,
                "stats": stats.__dict__,
            },
        )
        return best_candidate

    def _update_value_memory(self, candidate: PlanCandidate) -> None:
        previous = self._value_memory.get(candidate.job_id, candidate.expected_reward)
        updated = (1 - self._learning_rate) * previous + self._learning_rate * candidate.expected_reward
        self._value_memory[candidate.job_id] = updated
        _LOGGER.debug(
            "Planner value memory updated",
            extra={
                "job_id": candidate.job_id,
                "previous": previous,
                "updated": updated,
            },
        )
