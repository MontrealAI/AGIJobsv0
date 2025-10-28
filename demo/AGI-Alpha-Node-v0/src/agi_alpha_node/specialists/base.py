from __future__ import annotations

import abc
import statistics
from dataclasses import dataclass
from typing import Dict, Iterable, List

from ..knowledge import KnowledgeLake


@dataclass
class SpecialistOutcome:
    job_id: str
    domain: str
    reward: float
    confidence: float
    notes: str
    knowledge_updates: List[Dict[str, str]]


class Specialist(abc.ABC):
    def __init__(self, name: str, domain: str, knowledge: KnowledgeLake) -> None:
        self.name = name
        self.domain = domain
        self.knowledge = knowledge

    @abc.abstractmethod
    def solve(self, job: Dict[str, object]) -> SpecialistOutcome:
        raise NotImplementedError

    def _confidence_from_history(self, metric: str, default: float = 0.7) -> float:
        history = [entry["value"] for entry in self.knowledge.filter(domain=self.domain, metric=metric)]
        return statistics.fmean(history) if history else default

    def _record_outcome(self, outcome: SpecialistOutcome) -> None:
        for update in outcome.knowledge_updates:
            self.knowledge.store(domain=self.domain, **update)

    def execute(self, job: Dict[str, object]) -> SpecialistOutcome:
        outcome = self.solve(job)
        self._record_outcome(outcome)
        return outcome

    def diagnostics(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "domain": self.domain,
            "entries_in_knowledge": self.knowledge.count(domain=self.domain),
        }

    @staticmethod
    def summarise_outcomes(outcomes: Iterable[SpecialistOutcome]) -> Dict[str, float]:
        total_reward = sum(item.reward for item in outcomes)
        avg_confidence = statistics.fmean(item.confidence for item in outcomes) if outcomes else 0.0
        return {"total_reward": total_reward, "avg_confidence": avg_confidence}
