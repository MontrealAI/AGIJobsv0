"""Manufacturing optimizer specialist."""
from __future__ import annotations

from typing import Iterable

from ..knowledge import KnowledgeEntry, KnowledgeLake
from . import Specialist, SpecialistOutput


class ManufacturingOptimizer(Specialist):
    name = "manufacturing_optimizer"

    def run(self, task: str, knowledge: KnowledgeLake) -> SpecialistOutput:
        insights = list(self._optimise_supply_chain(knowledge))
        score = 1.1 + 0.2 * len(insights)
        summary = f"Engineered manufacturing rollout for '{task}' with {len(insights)} supply chain refinements."
        knowledge.add_entry(
            KnowledgeEntry(
                topic=f"manufacturing::{task}",
                content=summary,
                tags=["manufacturing", "alpha"],
            )
        )
        return SpecialistOutput(summary=summary, impact_score=score, knowledge_tags=("manufacturing", "alpha"))

    def _optimise_supply_chain(self, knowledge: KnowledgeLake) -> Iterable[str]:
        refinements = [entry.topic for entry in knowledge.query(tag="manufacturing")]
        if not refinements:
            yield "Global supply chain topology drafted."
        else:
            yield f"Integrated {len(refinements)} prior refinements into execution lattice."
