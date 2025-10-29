"""Job harvesting utilities."""
from __future__ import annotations

import itertools
import json
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional

from .logging_utils import get_logger

LOGGER = get_logger(__name__)


class TaskHarvester:
    """Iterates over job definitions from disk."""

    def __init__(self, source_path: Path, loop: bool = True) -> None:
        self.source_path = source_path
        self.loop = loop
        if not self.source_path.exists():
            raise FileNotFoundError(f"Job source not found: {source_path}")
        self._jobs = self._load_jobs()
        self._iterator: Iterator[Dict[str, object]] = iter(self._jobs)

    def _load_jobs(self) -> List[Dict[str, object]]:
        with self.source_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        LOGGER.info("Loaded %s jobs from %s", len(data), self.source_path)
        return data

    def next_job(self) -> Optional[Dict[str, object]]:
        if not self._jobs:
            LOGGER.info("No jobs available to harvest")
            return None
        try:
            job = next(self._iterator)
        except StopIteration:
            if not self.loop:
                return None
            if not self._jobs:
                LOGGER.info("No jobs available to harvest")
                return None
            self._iterator = iter(self._jobs)
            job = next(self._iterator)
        LOGGER.debug("Harvested job | id=%s domain=%s", job.get("id"), job.get("domain"))
        return job


__all__ = ["TaskHarvester"]
