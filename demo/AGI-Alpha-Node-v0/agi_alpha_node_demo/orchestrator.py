"""Orchestrator connecting planner outcomes to specialist execution."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List

from .jobs import Job
from .knowledge import Insight, KnowledgeLake
from .planner import MuZeroPlanner, PlannerOutcome
from .specialists import SpecialistRegistry

LOGGER = logging.getLogger("agi_alpha_node_demo.orchestrator")


@dataclass
class OrchestratorResult:
    job_id: str
    status: str
    reward: float
    reinvested: float
    distributed: float
    planner_rationale: str


class Orchestrator:
    def __init__(self, planner: MuZeroPlanner, knowledge_lake: KnowledgeLake, specialists: SpecialistRegistry) -> None:
        self.planner = planner
        self.knowledge_lake = knowledge_lake
        self.specialists = specialists

    def execute(self, job: Job) -> OrchestratorResult:
        LOGGER.info("Executing job", extra={"job_id": job.job_id, "type": job.job_type})
        planner_outcome = self._plan(job)
        specialist = self.specialists.get(job.job_type)
        specialist_result = specialist.solve(job.payload, planner_outcome)

        self.knowledge_lake.store(
            Insight(
                topic=job.job_type,
                content=specialist_result.get("summary", "No summary provided"),
                confidence=specialist_result.get("confidence", 0.5),
            )
        )

        reinvested = job.reinvest_amount()
        distributed = job.distribute_amount()
        LOGGER.info(
            "Job completed",
            extra={
                "job_id": job.job_id,
                "reinvested": reinvested,
                "distributed": distributed,
                "planner": planner_outcome.rationale,
            },
        )
        return OrchestratorResult(
            job_id=job.job_id,
            status="completed",
            reward=job.reward,
            reinvested=reinvested,
            distributed=distributed,
            planner_rationale=planner_outcome.rationale,
        )

    def _plan(self, job: Job) -> PlannerOutcome:
        features = self._featureise(job)
        LOGGER.debug("Planning features", extra={"job_id": job.job_id, "features": features})
        return self.planner.plan(features)

    @staticmethod
    def _featureise(job: Job) -> Dict[str, float]:
        base = {
            "alpha": 1.0 if job.job_type == "finance" else 0.8,
            "risk": 0.4 if job.job_type == "finance" else 0.6,
        }
        if "energy" in job.compliance_tags:
            base["sustainability"] = 0.9
        return base
