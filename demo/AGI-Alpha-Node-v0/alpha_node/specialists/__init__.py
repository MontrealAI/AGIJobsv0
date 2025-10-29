"""Specialist agent implementations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..knowledge import KnowledgeLake
from ..jobs import JobOpportunity


@dataclass(slots=True)
class SpecialistResult:
    job_id: str
    narrative: str
    projected_reward: float
    strategic_alpha: float


class Specialist(Protocol):
    name: str

    def solve(self, job: JobOpportunity, knowledge: KnowledgeLake) -> SpecialistResult:
        ...


class FinanceStrategist:
    name = "Finance Strategist"

    def __init__(self, model: str) -> None:
        self.model = model

    def solve(self, job: JobOpportunity, knowledge: KnowledgeLake) -> SpecialistResult:
        insight = knowledge.find("finance")
        alpha = job.reward * (1 + job.impact_score * 0.1)
        historical = insight.insight if insight else "archived treasury heuristics"
        base = f"Leveraged {self.model} to unlock compounding flows."
        if historical.lower() in base.lower():
            historical = "fresh market intelligence synthesized on-chain"
        narrative = f"{base} Heritage signal: {historical}."
        return SpecialistResult(
            job_id=job.job_id,
            narrative=narrative,
            projected_reward=alpha,
            strategic_alpha=min(1.0, 0.5 + job.impact_score / 10),
        )


class BiotechSynthesist:
    name = "Biotech Synthesist"

    def __init__(self, model: str) -> None:
        self.model = model

    def solve(self, job: JobOpportunity, knowledge: KnowledgeLake) -> SpecialistResult:
        insight = knowledge.find("bio")
        reward = job.reward * (1 + job.success_probability * 0.2)
        heritage = insight.insight if insight else "adaptive protein lattice priors"
        base = f"Synthesized pipeline via {self.model}."
        if heritage.lower() in base.lower():
            heritage = "emergent genomic intelligence from prior missions"
        narrative = f"{base} Linked biometrics insight: {heritage}."
        return SpecialistResult(
            job_id=job.job_id,
            narrative=narrative,
            projected_reward=reward,
            strategic_alpha=min(1.0, 0.4 + job.success_probability / 2),
        )


class ManufacturingOptimizer:
    name = "Manufacturing Optimizer"

    def __init__(self, model: str) -> None:
        self.model = model

    def solve(self, job: JobOpportunity, knowledge: KnowledgeLake) -> SpecialistResult:
        insight = knowledge.find("manufacturing")
        reward = job.reward * (1 + job.impact_score * 0.15)
        heritage = insight.insight if insight else "resilient supply lattice heuristics"
        base = f"Optimized production with {self.model}."
        if heritage.lower() in base.lower():
            heritage = "continuous improvement data from Alpha archives"
        narrative = f"{base} Operational insight: {heritage}."
        return SpecialistResult(
            job_id=job.job_id,
            narrative=narrative,
            projected_reward=reward,
            strategic_alpha=min(1.0, 0.45 + job.impact_score / 12),
        )


__all__ = [
    "Specialist",
    "SpecialistResult",
    "FinanceStrategist",
    "BiotechSynthesist",
    "ManufacturingOptimizer",
]
