"""Coordinates planner and specialists."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from ..ai.planner import MuZeroPlanner, PlannerResult
from ..ai.specialists.base import Specialist, SpecialistContext
from ..knowledge.lake import KnowledgeLake

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TaskEnvelope:
    job_id: int
    domain: str
    payload: Dict[str, str]


@dataclass(slots=True)
class ExecutionSummary:
    planner: PlannerResult
    specialist_outputs: Dict[str, Dict[str, float]]
    aggregated_value: float


class Orchestrator:
    def __init__(self, planner: MuZeroPlanner, knowledge_lake: KnowledgeLake,
                 specialists: Dict[str, Specialist]) -> None:
        self.planner = planner
        self.knowledge_lake = knowledge_lake
        self.specialists = specialists

    def _build_action_space(self, job: TaskEnvelope) -> Dict[str, float]:
        weights = {
            "finance": 0.4,
            "biotech": 0.3,
            "manufacturing": 0.3,
        }
        if job.domain in weights:
            weights[job.domain] += 0.2
        normalised = {key: value / sum(weights.values()) for key, value in weights.items()}
        logger.debug("Constructed action space", extra={"job_id": job.job_id, "weights": normalised})
        return normalised

    def execute(self, job: TaskEnvelope, stake_size: int) -> ExecutionSummary:
        action_space = self._build_action_space(job)
        planner_result = self.planner.plan(
            root_state=str(job.job_id),
            action_space=action_space,
            value_fn=lambda state_id: sum(action_space.values()),
        )
        knowledge_results = self.knowledge_lake.query(
            embedding=[0.1 * i for i in range(self.knowledge_lake.embedding_dim)],
            top_k=3,
        )
        knowledge_payload = {
            item.key: score for item, score in knowledge_results
        }
        outputs: Dict[str, Dict[str, float]] = {}
        aggregated_value = 0.0
        for specialist_key, specialist in self.specialists.items():
            context = SpecialistContext(
                knowledge_query=str(knowledge_payload),
                job_payload=job.payload,
                stake_size=stake_size,
            )
            result = specialist.execute(context)
            outputs[specialist_key] = {
                "value_delta": result.value_delta,
            }
            aggregated_value += result.value_delta
            self.knowledge_lake.upsert(
                key=f"job-{job.job_id}-{specialist_key}",
                embedding=[0.2 * (index + 1) for index in range(self.knowledge_lake.embedding_dim)],
                payload={"summary": result.summary, **result.artifacts},
            )
            logger.info("Specialist completed task", extra={"job_id": job.job_id, "specialist": specialist_key,
                                                             "value_delta": result.value_delta})

        summary = ExecutionSummary(
            planner=planner_result,
            specialist_outputs=outputs,
            aggregated_value=aggregated_value,
        )
        logger.info("Orchestrator completed job", extra={"job_id": job.job_id, "aggregated_value": aggregated_value})
        return summary


__all__ = ["Orchestrator", "TaskEnvelope", "ExecutionSummary"]
