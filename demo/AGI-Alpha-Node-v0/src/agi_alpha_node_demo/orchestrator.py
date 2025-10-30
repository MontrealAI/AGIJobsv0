from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List

from .knowledge.lake import KnowledgeLake
from .planner.muzero import MuZeroPlanner, PlannerDecision
from .specialists import SPECIALISTS, SpecialistResult
from .tasks.router import Job, TaskHarvester

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ExecutionReport:
    job_id: str
    planner: PlannerDecision
    specialist_results: List[SpecialistResult]
    total_reward: float


class Orchestrator:
    def __init__(self, planner: MuZeroPlanner, knowledge: KnowledgeLake, harvester: TaskHarvester) -> None:
        self.planner = planner
        self.knowledge = knowledge
        self.harvester = harvester

    def run_cycle(self) -> List[ExecutionReport]:
        reports: List[ExecutionReport] = []
        jobs = self.harvester.fetch_jobs()
        for job in jobs:
            report = self._execute_job(job)
            reports.append(report)
            self.harvester.acknowledge(job)
        return reports

    def _execute_job(self, job: Job) -> ExecutionReport:
        reward_estimates = self._estimate_rewards(job)
        planner_decision = self.planner.plan(job.id, reward_estimates)
        specialist = SPECIALISTS[job.domain]
        result = specialist.process(job.payload, self.knowledge)
        total_reward = planner_decision.expected_reward + result.reward_delta
        logger.info(
            "Job executed",
            extra={
                "context": {
                    "job_id": job.id,
                    "strategy": planner_decision.strategy,
                    "reward": total_reward,
                }
            },
        )
        return ExecutionReport(job.id, planner_decision, [result], total_reward)

    def _estimate_rewards(self, job: Job) -> Dict[str, float]:
        baseline = float(job.payload.get("reward", "1"))
        return {
            "conservative": baseline * 0.8,
            "balanced": baseline,
            "aggressive": baseline * 1.2,
        }


__all__ = ["ExecutionReport", "Orchestrator"]
