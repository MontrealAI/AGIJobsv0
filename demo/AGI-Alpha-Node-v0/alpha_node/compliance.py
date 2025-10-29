"""Compliance scorecard logic."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict

from .economy import StakeStatus
from .ens import ENSVerificationResult
from .governance import GovernanceState

_LOGGER = logging.getLogger(__name__)


@dataclass
class ComplianceScores:
    identity: float
    staking: float
    governance: float
    economic_engine: float
    antifragility: float
    strategic_intelligence: float

    @property
    def total(self) -> float:
        return round(
            (
                self.identity
                + self.staking
                + self.governance
                + self.economic_engine
                + self.antifragility
                + self.strategic_intelligence
            )
            / 6,
            4,
        )


class ComplianceScorecard:
    def evaluate(
        self,
        ens_result: ENSVerificationResult,
        stake_status: StakeStatus,
        governance: GovernanceState,
        planner_trend: float,
        antifragility_checks: Dict[str, bool],
    ) -> ComplianceScores:
        identity_score = 1.0 if ens_result.verified else 0.0
        staking_score = min(1.0, stake_status.staked_wei / stake_status.min_stake_wei) if stake_status.min_stake_wei else 0.0
        if stake_status.slashing_risk:
            staking_score *= 0.2
        governance_score = 1.0 if not governance.paused else 0.2
        economic_score = min(1.0, stake_status.rewards_wei / max(stake_status.min_stake_wei, 1) + 0.5)
        antifragility_score = 1.0 if all(antifragility_checks.values()) else 0.4
        strategic_score = max(0.0, min(1.0, planner_trend))

        scores = ComplianceScores(
            identity=round(identity_score, 3),
            staking=round(staking_score, 3),
            governance=round(governance_score, 3),
            economic_engine=round(economic_score, 3),
            antifragility=round(antifragility_score, 3),
            strategic_intelligence=round(strategic_score, 3),
        )
        _LOGGER.info("Compliance evaluated", extra={"scores": scores.__dict__, "total": scores.total})
        return scores
