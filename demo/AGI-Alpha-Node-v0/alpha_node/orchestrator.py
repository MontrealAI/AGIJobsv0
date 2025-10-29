"""Orchestration logic linking planner and specialists."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

from .knowledge import KnowledgeLake, KnowledgeRecord
from .planner import MuZeroPlanner, Plan
from .specialists import SpecialistAgent, SpecialistResult
from .state import AlphaNodeState
from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class ExecutionResult:
    plan: Plan
    specialist_result: SpecialistResult


class Orchestrator:
    def __init__(
        self,
        planner: MuZeroPlanner,
        specialists: Dict[str, SpecialistAgent],
        knowledge: KnowledgeLake,
        state: AlphaNodeState,
    ) -> None:
        self.planner = planner
        self.specialists = specialists
        self.knowledge = knowledge
        self.state = state

    def execute_job(self, job: Dict[str, object]) -> ExecutionResult:
        if self.state.governance.paused:
            raise RuntimeError("System is paused")
        domain = job.get("domain", "").lower()
        options = job.get("strategies", [])
        job_id = str(job.get("id"))
        plan = self.planner.plan(job_id=job_id, domain=domain, options=options)
        specialist = self.specialists.get(domain)
        if not specialist:
            raise ValueError(f"No specialist registered for domain: {domain}")
        payload = job.get("payload", {})
        specialist_result = specialist.execute(job_id, payload, self.knowledge)
        self.knowledge.add(
            KnowledgeRecord(
                job_id=job_id,
                domain=domain,
                insight=specialist_result.insight,
                reward_delta=specialist_result.reward_delta,
            )
        )
        self.state.register_completion(job_id, success=True)
        LOGGER.info("Job executed | job=%s domain=%s strategy=%s", job_id, domain, plan.strategy)
        return ExecutionResult(plan=plan, specialist_result=specialist_result)


__all__ = ["Orchestrator", "ExecutionResult"]
