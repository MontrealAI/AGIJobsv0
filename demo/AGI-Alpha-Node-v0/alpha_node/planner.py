"""MuZero++ inspired planner."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Dict, Iterable, List

from .config import PlannerSettings
from .jobs import JobOpportunity


@dataclass(slots=True)
class PlanDecision:
    job_id: str
    expected_value: float
    confidence: float
    rationale: str


class MuZeroPlanner:
    """A light-weight planner approximating MuZero style search."""

    def __init__(self, settings: PlannerSettings) -> None:
        self.settings = settings

    def score_job(self, job: JobOpportunity) -> float:
        expected_reward = job.reward * job.success_probability
        risk_penalty = self.settings.risk_aversion * (1 - job.success_probability)
        stake_penalty = job.stake_required * 0.05
        impact_bonus = job.impact_score * self.settings.exploitation_bias
        return expected_reward - risk_penalty - stake_penalty + impact_bonus

    def plan(self, jobs: Iterable[JobOpportunity]) -> List[PlanDecision]:
        nodes: Dict[str, float] = {}
        visits: Dict[str, int] = {}
        ordered_jobs = list(jobs)
        if not ordered_jobs:
            return []

        for _ in range(max(1, self.settings.horizon)):
            job = random.choice(ordered_jobs)
            score = self.score_job(job)
            nodes[job.job_id] = nodes.get(job.job_id, 0.0) + score
            visits[job.job_id] = visits.get(job.job_id, 0) + 1

        decisions: List[PlanDecision] = []
        for job in ordered_jobs:
            total_score = nodes.get(job.job_id, 0.0)
            visit_count = visits.get(job.job_id, 1)
            uct = total_score / visit_count + self.settings.exploration_constant * math.sqrt(
                math.log(sum(visits.values()) + 1) / visit_count
            )
            decisions.append(
                PlanDecision(
                    job_id=job.job_id,
                    expected_value=round(uct, 4),
                    confidence=min(1.0, visit_count / (self.settings.horizon or 1)),
                    rationale=(
                        f"reward:{job.reward:.2f} risk:{1 - job.success_probability:.2f} "
                        f"impact:{job.impact_score:.2f}"
                    ),
                )
            )
        decisions.sort(key=lambda item: item.expected_value, reverse=True)
        return decisions


__all__ = ["MuZeroPlanner", "PlanDecision"]
