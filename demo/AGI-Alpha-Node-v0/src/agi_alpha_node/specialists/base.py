"""Base classes for specialist agents."""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Dict, List

from ..knowledge import KnowledgeLake


@dataclass
class SpecialistContext:
    knowledge: KnowledgeLake
    planner_goal: str


class SpecialistAgent(abc.ABC):
    name: str

    def __init__(self, *, capabilities: List[str]):
        self.capabilities = capabilities

    @abc.abstractmethod
    def solve(self, job_payload: Dict[str, str], context: SpecialistContext) -> Dict[str, str]:
        """Execute the specialist's strategy and return results."""

    def explain(self) -> str:
        return f"{self.name} ready with capabilities: {', '.join(self.capabilities)}"


__all__ = ["SpecialistAgent", "SpecialistContext"]
