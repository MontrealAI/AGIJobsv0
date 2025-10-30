"""Base specialist interface."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict

from ..knowledge.lake import KnowledgeLake

LOGGER = logging.getLogger(__name__)


@dataclass
class SpecialistResult:
    success: bool
    detail: Dict[str, object]
    narrative: str


class Specialist(ABC):
    """Abstract specialist definition."""

    name: str

    def __init__(self, knowledge_lake: KnowledgeLake) -> None:
        self._knowledge_lake = knowledge_lake

    @abstractmethod
    def execute(self, job_payload: Dict[str, object]) -> SpecialistResult:
        """Perform the specialist task and return the result."""

    def store_insight(self, job_id: str, domain: str, result: SpecialistResult) -> None:
        if result.success:
            LOGGER.debug("Storing insight for %s", job_id)
            self._knowledge_lake.store(job_id, domain, 0.9, result.detail)
