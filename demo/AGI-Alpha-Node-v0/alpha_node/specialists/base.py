"""Base specialist class."""
from __future__ import annotations

import abc
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional

from ..knowledge import KnowledgeLake

_LOGGER = logging.getLogger(__name__)


@dataclass
class SpecialistResult:
    job_id: str
    specialist: str
    outcome: str
    reward_estimate: float
    metadata: Dict[str, str]
    completed_at: datetime


class BaseSpecialist(abc.ABC):
    name: str

    def __init__(self, knowledge: KnowledgeLake) -> None:
        self._knowledge = knowledge

    @abc.abstractmethod
    def evaluate(self, job_payload: Dict[str, str]) -> SpecialistResult:
        """Produce a result for a job."""

    def _record(self, result: SpecialistResult) -> SpecialistResult:
        self._knowledge.record(
            topic=f"specialist:{self.name}",
            content=f"Completed job {result.job_id}: {result.outcome}",
            tags=[self.name, "job"],
            confidence=0.85,
        )
        _LOGGER.info(
            "Specialist result recorded",
            extra={
                "specialist": self.name,
                "job_id": result.job_id,
                "reward_estimate": result.reward_estimate,
            },
        )
        return result

    def _result(
        self, job_id: str, outcome: str, reward_estimate: float, metadata: Optional[Dict[str, str]] = None
    ) -> SpecialistResult:
        result = SpecialistResult(
            job_id=job_id,
            specialist=self.name,
            outcome=outcome,
            reward_estimate=reward_estimate,
            metadata=metadata or {},
            completed_at=datetime.now(timezone.utc),
        )
        return self._record(result)
