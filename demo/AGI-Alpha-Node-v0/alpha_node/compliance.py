"""Compliance scorecard implementation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .state import AlphaNodeState
from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class ComplianceScore:
    dimensions: Dict[str, float]
    composite: float


class ComplianceEngine:
    DIMENSIONS = (
        "identity",
        "staking",
        "governance",
        "economic_engine",
        "antifragility",
        "strategic_intelligence",
    )

    def __init__(self, state: AlphaNodeState, required_stake: int) -> None:
        self.state = state
        self.required_stake = required_stake

    def evaluate(self) -> ComplianceScore:
        snapshot = self.state.snapshot()
        identity = 1.0 if snapshot["operations"]["ens_verified"] else 0.0
        stake_requirement = self.required_stake or 1
        staking = min(snapshot["economy"]["staked_amount"] / stake_requirement, 1.0)
        governance = 1.0 if not snapshot["governance"]["paused"] else 0.5
        economic = min(1.0, snapshot["economy"]["rewards_accrued"] / stake_requirement)
        drills = snapshot["operations"].get("drills_completed", 0)
        antifragile_base = 1.0 if snapshot["economy"]["slashed_amount"] == 0 else 0.3
        antifragile = min(1.0, antifragile_base + 0.1 * min(drills, 5))
        strategic = min(1.0, snapshot["operations"]["completed_jobs"] / 5)
        dimensions = {
            "identity": identity,
            "staking": staking,
            "governance": governance,
            "economic_engine": economic,
            "antifragility": antifragile,
            "strategic_intelligence": strategic,
        }
        composite = sum(dimensions.values()) / len(dimensions)
        LOGGER.info("Compliance evaluation | score=%.2f dimensions=%s", composite, dimensions)
        self.state.set_compliance(composite)
        return ComplianceScore(dimensions=dimensions, composite=composite)


__all__ = ["ComplianceEngine", "ComplianceScore"]
