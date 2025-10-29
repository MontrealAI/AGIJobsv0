"""Specialist agent interfaces."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..knowledge import KnowledgeLake


@dataclass
class SpecialistOutput:
    summary: str
    impact_score: float
    knowledge_tags: tuple[str, ...]


class Specialist(Protocol):
    name: str

    def run(self, task: str, knowledge: KnowledgeLake) -> SpecialistOutput:
        ...
