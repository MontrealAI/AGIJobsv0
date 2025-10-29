"""Task harvester that listens for on-chain jobs."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from ..blockchain.jobs import Job, JobRegistry

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TaskHarvester:
    registry: JobRegistry

    def poll(self) -> Iterable[Job]:
        logger.info("Polling for new jobs")
        return self.registry.list_open_jobs()


__all__ = ["TaskHarvester"]
