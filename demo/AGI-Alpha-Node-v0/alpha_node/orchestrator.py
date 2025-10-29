"""Orchestrator connecting planner to specialists."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from .knowledge import KnowledgeLake
from .planner import MuZeroPlanner, PlanCandidate
from .specialists import (
    BaseSpecialist,
    BiotechSynthesist,
    FinanceStrategist,
    ManufacturingOptimizer,
    SpecialistResult,
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class ExecutionOutcome:
    plan: PlanCandidate
    result: SpecialistResult


class Orchestrator:
    """Coordinates planner and specialist execution."""

    def __init__(
        self,
        planner: MuZeroPlanner,
        knowledge: KnowledgeLake,
        specialists: Optional[Dict[str, BaseSpecialist]] = None,
    ) -> None:
        self._planner = planner
        self._knowledge = knowledge
        self._specialists = specialists or {
            "finance": FinanceStrategist(knowledge),
            "biotech": BiotechSynthesist(knowledge),
            "manufacturing": ManufacturingOptimizer(knowledge),
        }

    def execute(self, jobs: Iterable[Dict[str, float]]) -> ExecutionOutcome:
        jobs_list: List[Dict[str, float]] = list(jobs)
        plan = self._planner.propose(jobs_list)
        job_payload = next(job for job in jobs_list if job["job_id"] == plan.job_id)
        metadata = job_payload.get("metadata", {})
        specialist = self._select_specialist(plan, metadata)
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

    def _select_specialist(self, plan: PlanCandidate, metadata: Dict[str, object]) -> BaseSpecialist:
        domain = str(metadata.get("domain", "")).lower()
        if domain in self._specialists:
            return self._specialists[domain]
        description = plan.description.lower()
        for keyword, fallback in {
            "deploy": "finance",
            "synth": "biotech",
            "manufact": "manufacturing",
        }.items():
            if keyword in description and fallback in self._specialists:
                return self._specialists[fallback]
        # Default to any available specialist to keep the node productive.
        return next(iter(self._specialists.values()))
