"""Compliance scorecard computation."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, Iterable, List


@dataclass
class DimensionScore:
    name: str
    score: float
    rationale: str

    def as_dict(self) -> Dict[str, str | float]:
        return {"name": self.name, "score": round(self.score, 4), "rationale": self.rationale}


@dataclass
class ComplianceScore:
    dimensions: List[DimensionScore] = field(default_factory=list)

    @property
    def total(self) -> float:
        if not self.dimensions:
            return 0.0
        return sum(d.score for d in self.dimensions) / len(self.dimensions)

    def as_dict(self) -> Dict[str, object]:
        return {"total": round(self.total, 4), "dimensions": [d.as_dict() for d in self.dimensions]}

    def to_json(self) -> str:
        return json.dumps(self.as_dict(), indent=2)


class ComplianceScorecard:
    """Compute compliance metrics based on runtime signals."""

    def compute(
        self,
        *,
        ens_verified: bool,
        stake_ok: bool,
        governance_address: str,
        pause_status: bool,
        rewards_growth: float,
        antifragility_score: float,
        intelligence_score: float,
    ) -> ComplianceScore:
        dimensions = [
            DimensionScore(
                name="Identity & ENS",
                score=1.0 if ens_verified else 0.0,
                rationale="ENS ownership verified" if ens_verified else "ENS verification failed",
            ),
            DimensionScore(
                name="Staking & Activation",
                score=1.0 if stake_ok else 0.2,
                rationale="Minimum stake satisfied" if stake_ok else "Stake below activation threshold",
            ),
            DimensionScore(
                name="Governance & Safety",
                score=0.9 if not pause_status else 0.4,
                rationale="System operational" if not pause_status else "System paused awaiting intervention",
            ),
            DimensionScore(
                name="Economic Engine",
                score=min(max(rewards_growth, 0.0), 1.0),
                rationale="Reward accrual normalized to target",
            ),
            DimensionScore(
                name="Antifragility",
                score=min(max(antifragility_score, 0.0), 1.0),
                rationale="Stress drills and invariant checks",
            ),
            DimensionScore(
                name="Strategic Intelligence",
                score=min(max(intelligence_score, 0.0), 1.0),
                rationale="Planner & specialists compounding outcomes",
            ),
        ]
        return ComplianceScore(dimensions=dimensions)
