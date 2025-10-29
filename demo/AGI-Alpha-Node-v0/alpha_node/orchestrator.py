"""Orchestrator connecting planner and specialists."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

from .knowledge import KnowledgeLake, KnowledgeEntry
from .jobs import JobOpportunity
from .planner import MuZeroPlanner, PlanDecision
from .specialists import (
    BiotechSynthesist,
    FinanceStrategist,
    ManufacturingOptimizer,
    Specialist,
    SpecialistResult,
)
from .state import StateStore


@dataclass(slots=True)
class ExecutionReport:
    decisions: List[PlanDecision]
    specialist_outputs: Dict[str, SpecialistResult]


class AlphaOrchestrator:
    """Coordinates planning, execution, and knowledge capture."""

    def __init__(
        self,
        planner: MuZeroPlanner,
        knowledge: KnowledgeLake,
        specialists: Dict[str, Specialist],
        store: StateStore,
    ) -> None:
        self.planner = planner
        self.knowledge = knowledge
        self.specialists = specialists
        self.store = store

    def run(self, jobs: Iterable[JobOpportunity]) -> ExecutionReport:
        jobs_list = list(jobs)
        decisions = self.planner.plan(jobs_list)
        outputs: Dict[str, SpecialistResult] = {}
        for decision in decisions:
            job = next(job for job in jobs_list if job.job_id == decision.job_id)
            specialist = self.specialists.get(job.domain, self.specialists["default"])
            result = specialist.solve(job, self.knowledge)
            outputs[job.job_id] = result
            self.knowledge.add_entry(
                KnowledgeEntry(
                    topic=f"{job.domain}-{job.job_id}",
                    insight=result.narrative,
                    impact=result.strategic_alpha,
                    job_id=job.job_id,
                )
            )
        antifragility = min(1.0, sum(r.strategic_alpha for r in outputs.values()) / 3)
        strategic_alpha = min(1.0, sum(d.expected_value for d in decisions) / 100)
        self.store.update(
            antifragility_index=antifragility,
            strategic_alpha_index=strategic_alpha,
        )
        return ExecutionReport(decisions=decisions, specialist_outputs=outputs)


def build_specialists(settings) -> Dict[str, Specialist]:
    return {
        "finance": FinanceStrategist(settings.finance_model),
        "biotech": BiotechSynthesist(settings.biotech_model),
        "manufacturing": ManufacturingOptimizer(settings.manufacturing_model),
        "default": FinanceStrategist(settings.finance_model),
    }


__all__ = ["AlphaOrchestrator", "ExecutionReport", "build_specialists"]
