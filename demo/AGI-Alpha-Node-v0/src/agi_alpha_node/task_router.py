"""Job Router & Registry integration."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .config import JobConfig

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class Job:
    job_id: str
    domain: str
    complexity: float
    reward: float
    payload: Dict[str, str]


class TaskHarvester:
    """Fetch and filter jobs for the orchestrator."""

    def __init__(self, config: JobConfig, jobs_path: Optional[Path] = None):
        self.config = config
        self._jobs_path = jobs_path or Path(__file__).resolve().parent / ".." / ".." / "data" / "jobs.json"

    def available_jobs(self) -> Iterable[Job]:
        if not self._jobs_path.exists():
            LOGGER.warning("Job registry file not found", extra={"event": "job_registry_missing"})
            return []
        data = json.loads(self._jobs_path.read_text())
        jobs = [Job(**item) for item in data]
        LOGGER.debug(
            "Loaded jobs", extra={"event": "jobs_loaded", "data": {"count": len(jobs)}}
        )
        return jobs

    def eligible_jobs(self, capability_scores: Dict[str, float]) -> List[Job]:
        eligible: List[Job] = []
        for job in self.available_jobs():
            score = capability_scores.get(job.domain, 0)
            if score >= self.config.eligibility_threshold:
                eligible.append(job)
        LOGGER.info(
            "Eligible jobs computed",
            extra={"event": "jobs_eligible", "data": {"count": len(eligible)}},
        )
        return eligible


__all__ = ["TaskHarvester", "Job"]
