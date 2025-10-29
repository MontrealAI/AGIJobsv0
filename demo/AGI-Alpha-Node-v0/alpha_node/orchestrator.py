"""Orchestrator connecting planner to specialists."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List

from .knowledge import KnowledgeLake
from .planner import MuZeroPlanner, PlanCandidate
from .specialists import BiotechSynthesist, FinanceStrategist, ManufacturingOptimizer, SpecialistResult

_LOGGER = logging.getLogger(__name__)


@dataclass
class ExecutionOutcome:
    plan: PlanCandidate
    result: SpecialistResult


class Orchestrator:
    """Coordinates planner and specialist execution."""

    def __init__(self, planner: MuZeroPlanner, knowledge: KnowledgeLake) -> None:
        self._planner = planner
        self._knowledge = knowledge
        self._specialists = {
            "deploy": FinanceStrategist(knowledge),
            "synthesize": BiotechSynthesist(knowledge),
            "optimize": ManufacturingOptimizer(knowledge),
        }

    def execute(self, jobs: Iterable[Dict[str, float]]) -> ExecutionOutcome:
        plan = self._planner.propose(jobs)
        specialist = self._select_specialist(plan)
        job_payload = next(job for job in jobs if job["job_id"] == plan.job_id)
        result = specialist.evaluate(job_payload)
        self._knowledge.record(
            topic="orchestrator",
            content=f"Executed job {plan.job_id} via {specialist.name}",
            tags=[specialist.name, "execution"],
            confidence=0.92,
        )
        _LOGGER.info(
            "Orchestrator completed job",
            extra={
                "job_id": plan.job_id,
                "specialist": specialist.name,
                "reward_estimate": result.reward_estimate,
            },
        )
        return ExecutionOutcome(plan=plan, result=result)

    def _select_specialist(self, plan: PlanCandidate):
        for keyword, specialist in self._specialists.items():
            if keyword in plan.description.lower():
                return specialist
        return self._specialists["optimize"]
