"""MuZero-inspired planner (simplified for the demo)."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Iterable, List

from ..knowledge.lake import KnowledgeLake


@dataclass
class PlanStep:
    job_id: str
    domain: str
    expected_value: float
    exploration_bonus: float


class Planner:
    """Simplified tree-search planner delivering prioritized jobs."""

    def __init__(self, knowledge: KnowledgeLake, rollout_depth: int, exploration_constant: float, simulations: int) -> None:
        self._knowledge = knowledge
        self._rollout_depth = rollout_depth
        self._exploration_constant = exploration_constant
        self._simulations = simulations
        self._intelligence_score = 0.7

    def plan(self, jobs: Iterable[dict]) -> List[PlanStep]:
        insights = self._knowledge.fetch_recent(limit=50)
        plans: List[PlanStep] = []
        for job in jobs:
            value = self._evaluate_job(job, insights)
            bonus = self._exploration_bonus(job)
            plans.append(
                PlanStep(
                    job_id=job["id"],
                    domain=job["domain"],
                    expected_value=value,
                    exploration_bonus=bonus,
                )
            )
        plans.sort(key=lambda step: step.expected_value + step.exploration_bonus, reverse=True)
        self._intelligence_score = min(1.0, 0.6 + len(plans) * 0.02)
        return plans

    def intelligence_score(self) -> float:
        return self._intelligence_score

    def _evaluate_job(self, job: dict, insights: List[dict]) -> float:
        domain = job.get("domain", "unknown")
        reward = float(job.get("reward", 0))
        historical = [ins for ins in insights if ins.get("domain") == domain]
        knowledge_bonus = sum(item.get("quality_score", 0.8) for item in historical[:5]) / max(len(historical[:5]), 1)
        baseline = math.log1p(reward)
        return baseline * knowledge_bonus

    def _exploration_bonus(self, job: dict) -> float:
        hashable = hash(job.get("id"))
        random.seed(hashable + self._rollout_depth)
        value = random.random() * self._exploration_constant
        return value
