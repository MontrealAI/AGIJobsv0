"""MuZero-inspired planner coordinating job execution."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple
import logging
import math
import random

LOGGER = logging.getLogger(__name__)


@dataclass
class PlanCandidate:
    job_id: str
    domain: str
    expected_reward: float
    risk_score: float
    confidence: float


class EconomicWorldModel:
    """Simplified differentiable model of job outcomes."""

    def __init__(self) -> None:
        self._history: Dict[str, List[float]] = {}

    def update(self, domain: str, reward: float) -> None:
        history = self._history.setdefault(domain, [])
        history.append(reward)
        LOGGER.debug("Updated world model", extra={"domain": domain, "reward": reward})

    def expected_value(self, domain: str) -> float:
        history = self._history.get(domain)
        if not history:
            return 1.0
        return sum(history) / len(history)


class MuZeroPlanner:
    """Planner that balances exploration and exploitation."""

    def __init__(self, exploration_constant: float = 1.4, horizon: int = 3) -> None:
        self._world_model = EconomicWorldModel()
        self._exploration_constant = exploration_constant
        self._horizon = horizon

    def plan(self, jobs: Iterable[Dict[str, object]]) -> List[PlanCandidate]:
        """Return prioritized plan candidates sorted by confidence."""
        candidates: List[PlanCandidate] = []
        for job in jobs:
            domain = str(job["domain"])
            reward = float(job.get("reward", 0))
            simulated_reward, risk, confidence = self._simulate(domain, reward)
            candidate = PlanCandidate(
                job_id=str(job["job_id"]),
                domain=domain,
                expected_reward=simulated_reward,
                risk_score=risk,
                confidence=confidence,
            )
            LOGGER.info(
                "Planner evaluated job",
                extra={
                    "job_id": candidate.job_id,
                    "expected_reward": candidate.expected_reward,
                    "risk": candidate.risk_score,
                    "confidence": candidate.confidence,
                },
            )
            candidates.append(candidate)

        return sorted(candidates, key=lambda c: (c.confidence, c.expected_reward), reverse=True)

    def record_outcome(self, domain: str, reward: float) -> None:
        self._world_model.update(domain, reward)

    def _simulate(self, domain: str, base_reward: float) -> Tuple[float, float, float]:
        baseline = self._world_model.expected_value(domain)
        exploration_bonus = self._exploration_constant * math.sqrt(math.log(self._horizon + 1))
        simulated_reward = base_reward * (1 + 0.05 * random.random()) + baseline * exploration_bonus
        risk = max(0.05, min(0.6, 0.3 - baseline / (base_reward + 1e-9) + random.random() * 0.1))
        confidence = min(1.0, 0.5 + baseline / (base_reward + 1e-9) + random.random() * 0.3)
        return simulated_reward, risk, confidence


__all__ = ["MuZeroPlanner", "PlanCandidate"]
