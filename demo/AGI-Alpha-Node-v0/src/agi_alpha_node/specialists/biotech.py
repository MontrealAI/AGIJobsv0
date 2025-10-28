from __future__ import annotations

from typing import Dict

from .base import Specialist, SpecialistOutcome


class BiotechSpecialist(Specialist):
    def __init__(self, knowledge) -> None:
        super().__init__(name="Biotech Synthesist", domain="biotech", knowledge=knowledge)

    def solve(self, job: Dict[str, object]) -> SpecialistOutcome:
        reward = float(job.get("reward", 0.0))
        historical_yield = self._confidence_from_history("yield", default=0.72)
        confidence = min(0.98, historical_yield + 0.1)
        notes = "Automated gene-circuit optimisation delivered breakthrough therapeutic prototype with verified biosafety."
        return SpecialistOutcome(
            job_id=str(job.get("job_id")),
            domain=self.domain,
            reward=reward * confidence,
            confidence=confidence,
            notes=notes,
            knowledge_updates=[
                {"metric": "yield", "value": reward * 0.002, "note": "Iterative lab simulation increased synthesis accuracy."},
                {"metric": "compliance", "value": 0.99, "note": "Biosafety audits passed flawlessly."},
            ],
        )
