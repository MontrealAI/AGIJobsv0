"""Biotech synthesist specialist."""
from __future__ import annotations

from statistics import median
from typing import Iterable

from ..knowledge import KnowledgeEntry, KnowledgeLake
from . import Specialist, SpecialistOutput


class BiotechSynthesist(Specialist):
    name = "biotech_synthesist"

    def run(self, task: str, knowledge: KnowledgeLake) -> SpecialistOutput:
        insights = list(self._simulate_cellular_models(knowledge))
        score = 0.9 + 0.1 * len(insights)
        summary = f"Synthesised biotech protocol for '{task}' with {len(insights)} lab-ready pathways."
        knowledge.add_entry(
            KnowledgeEntry(
                topic=f"biotech::{task}",
                content=summary,
                tags=["biotech", "alpha"],
            )
        )
        return SpecialistOutput(summary=summary, impact_score=score, knowledge_tags=("biotech", "alpha"))

    def _simulate_cellular_models(self, knowledge: KnowledgeLake) -> Iterable[str]:
        complexities = [len(entry.topic) for entry in knowledge.query(tag="biotech")]
        if not complexities:
            yield "Cellular simulation baseline established."
        else:
            yield f"Cellular synthesis complexity median: {median(complexities):.1f}."
