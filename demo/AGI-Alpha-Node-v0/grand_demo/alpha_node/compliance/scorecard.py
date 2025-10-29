"""Compliance scoring for AGI Alpha Node."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict

logger = logging.getLogger(__name__)


DIMENSIONS = (
    "identity",
    "staking",
    "governance",
    "economic",
    "antifragility",
    "intelligence",
)


@dataclass(slots=True)
class ComplianceScore:
    identity: float
    staking: float
    governance: float
    economic: float
    antifragility: float
    intelligence: float

    def aggregate(self) -> float:
        return sum(
            getattr(self, dimension) for dimension in DIMENSIONS
        ) / len(DIMENSIONS)

    def as_dict(self) -> Dict[str, float]:
        data = {dimension: getattr(self, dimension) for dimension in DIMENSIONS}
        data["aggregate"] = self.aggregate()
        return data


class ComplianceEngine:
    def build_score(self, *, ens_verified: bool, stake_ok: bool, paused: bool,
                    rewards_growth: float, drills_ok: bool, planner_confidence: float) -> ComplianceScore:
        identity = 1.0 if ens_verified else 0.0
        staking = 1.0 if stake_ok else 0.0
        governance = 1.0 if not paused else 0.4
        economic = min(1.0, max(0.0, rewards_growth))
        antifragility = 1.0 if drills_ok else 0.5
        intelligence = min(1.0, planner_confidence)
        score = ComplianceScore(
            identity=identity,
            staking=staking,
            governance=governance,
            economic=economic,
            antifragility=antifragility,
            intelligence=intelligence,
        )
        logger.info("Computed compliance score", extra=score.as_dict())
        return score


__all__ = ["ComplianceEngine", "ComplianceScore"]
