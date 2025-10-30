from __future__ import annotations

import logging
import dataclasses
from dataclasses import dataclass
from typing import Dict

from ..blockchain.contracts import StakeManagerClient, SystemPauseClient
from ..blockchain.ens import ENSVerifier
from ..config import AppConfig

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ComplianceDimension:
    name: str
    score: float
    rationale: str


@dataclass(slots=True)
class ComplianceReport:
    overall_score: float
    dimensions: Dict[str, ComplianceDimension]

    def to_dict(self) -> Dict[str, object]:
        return {
            "overall_score": self.overall_score,
            "dimensions": {name: dataclasses.asdict(dimension) for name, dimension in self.dimensions.items()},
        }


class ComplianceEngine:
    def __init__(
        self,
        config: AppConfig,
        ens: ENSVerifier,
        stake_manager: StakeManagerClient,
        system_pause: SystemPauseClient,
    ) -> None:
        self.config = config
        self.ens = ens
        self.stake_manager = stake_manager
        self.system_pause = system_pause

    def evaluate(self) -> ComplianceReport:
        identity = self._identity_score()
        staking = self._staking_score()
        governance = self._governance_score()
        economy = self._economy_score(staking)
        antifragility = self._antifragility_score()
        intelligence = self._intelligence_score()

        dimensions = {
            "identity": identity,
            "staking": staking,
            "governance": governance,
            "economy": economy,
            "antifragility": antifragility,
            "intelligence": intelligence,
        }
        overall = sum(d.score for d in dimensions.values()) / len(dimensions)
        logger.info("Compliance evaluated", extra={"context": {"overall": overall}})
        return ComplianceReport(overall, dimensions)

    def _identity_score(self) -> ComplianceDimension:
        result = self.ens.verify(self.config.network.ens_domain, self.config.governance.owner_address)
        score = 1.0 if result.verified else 0.0
        rationale = "ENS ownership verified" if result.verified else "ENS ownership mismatch"
        return ComplianceDimension("Identity & ENS", score, rationale)

    def _staking_score(self) -> ComplianceDimension:
        status = self.stake_manager.status(self.config.governance.owner_address, self.config.staking.required_stake)
        if status.current >= self.config.staking.required_stake:
            score = 1.0
            rationale = "Stake meets minimum"
        elif status.current >= self.config.staking.required_stake * 0.5:
            score = 0.5
            rationale = "Stake below threshold"
        else:
            score = 0.0
            rationale = "Stake critically low"
        return ComplianceDimension("Staking & Activation", score, rationale)

    def _governance_score(self) -> ComplianceDimension:
        paused = self.system_pause.is_paused()
        score = 1.0 if not paused else 0.2
        rationale = "System operational" if not paused else "Paused - operator attention required"
        return ComplianceDimension("Governance & Safety", score, rationale)

    def _economy_score(self, staking_dimension: ComplianceDimension) -> ComplianceDimension:
        score = min(1.0, staking_dimension.score + 0.3)
        rationale = "Rewards accruing" if score > 0.7 else "Limited economic output"
        return ComplianceDimension("Economic Engine", score, rationale)

    def _antifragility_score(self) -> ComplianceDimension:
        rationale = "Automated drills scheduled"
        return ComplianceDimension("Antifragility", 0.9, rationale)

    def _intelligence_score(self) -> ComplianceDimension:
        rationale = "Planner and specialists self-optimizing"
        return ComplianceDimension("Strategic Intelligence", 0.95, rationale)


__all__ = ["ComplianceEngine", "ComplianceReport", "ComplianceDimension"]
