"""Task harvester bridging on-chain jobs and local datasets."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, List

from ..blockchain.jobs import JobRegistry
from ..config import load_yaml

LOGGER = logging.getLogger(__name__)


class TaskHarvester:
    """Collects jobs from local configuration or on-chain registry."""

    def __init__(self, job_registry: JobRegistry, base_path: Path, job_source: str) -> None:
        self._job_registry = job_registry
        self._base_path = base_path
        self._job_source = job_source

    def load_jobs(self) -> List[dict]:
        local_jobs = self._load_local_jobs()
        if local_jobs:
            LOGGER.debug("Loaded %d local jobs", len(local_jobs))
        onchain_jobs = list(self._job_registry.fetch_jobs())
        if onchain_jobs:
            LOGGER.debug("Loaded %d on-chain jobs", len(onchain_jobs))
        combined = local_jobs + [job.payload for job in onchain_jobs]
        # Deduplicate by job id
        seen = set()
        deduped = []
        for job in combined:
            job_id = job.get("id") or job.get("job_id")
            if job_id in seen:
                continue
            seen.add(job_id)
            deduped.append(job | {"id": job_id})
        return deduped

    def _load_local_jobs(self) -> List[dict]:
        path = (self._base_path / self._job_source).resolve()
        if not path.exists():
            LOGGER.warning("Local job source %s not found", path)
            return []
        data = load_yaml(path)
        if isinstance(data, list):
            return data
        LOGGER.error("Unexpected job source format at %s", path)
        return []
