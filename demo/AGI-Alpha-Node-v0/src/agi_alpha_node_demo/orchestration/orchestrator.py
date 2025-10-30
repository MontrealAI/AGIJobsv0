"""Orchestrator bridging planner and specialists."""
from __future__ import annotations

import logging
from typing import Dict, Iterable, List

from ..metrics.hub import MetricsHub
from ..specialists.base import Specialist, SpecialistResult
from .planner import Planner, PlanStep

LOGGER = logging.getLogger(__name__)


class Orchestrator:
    """Coordinate specialists to execute planned jobs."""

    def __init__(self, planner: Planner, specialists: Dict[str, Specialist], metrics: MetricsHub) -> None:
        self._planner = planner
        self._specialists = specialists
        self._metrics = metrics

    def execute(self, jobs: Iterable[dict]) -> List[Dict[str, object]]:
        job_list = list(jobs)
        plans = self._planner.plan(job_list)
        results: List[Dict[str, object]] = []
        self._metrics.set_active_jobs(len(plans))
        for step in plans:
            specialist = self._specialists.get(step.domain)
            if specialist is None:
                LOGGER.warning("No specialist available for domain %s", step.domain)
                continue
            job_payload = next(job for job in job_list if job["id"] == step.job_id)
            LOGGER.info("Dispatching %s to %s", step.job_id, specialist.name)
            try:
                result = specialist.execute(job_payload)
                self._metrics.specialist_result(specialist.name, result.success)
                if result.success:
                    self._metrics.job_completed()
                results.append(
                    {
                        "job_id": step.job_id,
                        "specialist": specialist.name,
                        "success": result.success,
                        "narrative": result.narrative,
                        "detail": result.detail,
                        "expected_value": step.expected_value + step.exploration_bonus,
                    }
                )
                self._metrics.record_event(
                    f"Job {step.job_id} executed by {specialist.name}: {'success' if result.success else 'failure'}"
                )
            except Exception as exc:  # pragma: no cover - defensive
                LOGGER.exception("Specialist %s failed on job %s", specialist.name, step.job_id)
                self._metrics.specialist_result(specialist.name, False)
                results.append(
                    {
                        "job_id": step.job_id,
                        "specialist": specialist.name,
                        "success": False,
                        "narrative": str(exc),
                        "detail": {},
                        "expected_value": step.expected_value + step.exploration_bonus,
                    }
                )
        self._metrics.set_active_jobs(0)
        return results

    def intelligence_score(self) -> float:
        return self._planner.intelligence_score()
