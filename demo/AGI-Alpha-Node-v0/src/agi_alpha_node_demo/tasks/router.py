from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List

from ..blockchain.contracts import JobRegistryClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Job:
    id: str
    domain: str
    payload: Dict[str, str]


class TaskHarvester:
    def __init__(self, registry: JobRegistryClient) -> None:
        self.registry = registry

    def fetch_jobs(self) -> List[Job]:
        jobs: List[Job] = []
        for job_id, payload in self.registry.fetch_available_jobs().items():
            domain = payload.get("domain", "finance")
            jobs.append(Job(id=job_id, domain=domain, payload={**payload, "id": job_id}))
        logger.debug("Harvested jobs", extra={"context": [job.id for job in jobs]})
        return jobs

    def acknowledge(self, job: Job) -> None:
        self.registry.complete_job(job.id)


__all__ = ["Job", "TaskHarvester"]
