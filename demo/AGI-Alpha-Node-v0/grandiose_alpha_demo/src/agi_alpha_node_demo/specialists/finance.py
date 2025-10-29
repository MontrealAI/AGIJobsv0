"""Finance strategist specialist."""
from __future__ import annotations

import math
from statistics import mean
from typing import Iterable

from ..knowledge import KnowledgeEntry, KnowledgeLake
from . import Specialist, SpecialistOutput


class FinanceStrategist(Specialist):
    name = "finance_strategist"

    def run(self, task: str, knowledge: KnowledgeLake) -> SpecialistOutput:
        insights = list(self._analyse(knowledge))
        ratio = 1 + math.log1p(len(insights))
        summary = f"Optimised capital routing for task '{task}' with {len(insights)} strategic insights."
        knowledge.add_entry(
            KnowledgeEntry(
                topic=f"finance::{task}",
                content=summary,
                tags=["finance", "alpha"],
            )
        )
        return SpecialistOutput(summary=summary, impact_score=ratio, knowledge_tags=("finance", "alpha"))

    def _analyse(self, knowledge: KnowledgeLake) -> Iterable[str]:
        scores = [len(entry.content) for entry in knowledge.query(tag="finance")]
        if not scores:
            yield "Initial capital deployment model created."
        else:
            yield f"Capital efficiency improved to {mean(scores):.2f} knowledge units."
