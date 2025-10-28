from __future__ import annotations

from typing import Dict

from .base import Specialist, SpecialistOutcome


class FinanceSpecialist(Specialist):
    def __init__(self, knowledge) -> None:
        super().__init__(name="Finance Strategist", domain="finance", knowledge=knowledge)

    def solve(self, job: Dict[str, object]) -> SpecialistOutcome:
        reward = float(job.get("reward", 0.0))
        historical_alpha = self._confidence_from_history("alpha", default=0.8)
        confidence = min(0.99, historical_alpha + 0.05)
        notes = (
            "Executed arbitrage sweep across cross-chain liquidity venues; locked in capital-efficient treasury expansion."
        )
        outcome = SpecialistOutcome(
            job_id=str(job.get("job_id")),
            domain=self.domain,
            reward=reward * confidence,
            confidence=confidence,
            notes=notes,
            knowledge_updates=[
                {"metric": "alpha", "value": reward * 0.001, "note": "New alpha leak patched."},
                {"metric": "risk", "value": 1 - confidence, "note": "Residual counterparty exposure lowered."},
            ],
        )
        return outcome
