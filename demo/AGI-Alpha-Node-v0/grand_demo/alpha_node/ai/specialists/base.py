"""Base specialist interface."""
from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Dict, Protocol


class SpecialistResult(Protocol):
    summary: str
    value_delta: float
    artifacts: Dict[str, str]


@dataclass(slots=True)
class SpecialistContext:
    knowledge_query: str
    job_payload: Dict[str, str]
    stake_size: int


class Specialist(abc.ABC):
    name: str

    def __init__(self, name: str) -> None:
        self.name = name

    @abc.abstractmethod
    def execute(self, context: SpecialistContext) -> SpecialistResult:
        raise NotImplementedError


__all__ = ["Specialist", "SpecialistContext", "SpecialistResult"]
