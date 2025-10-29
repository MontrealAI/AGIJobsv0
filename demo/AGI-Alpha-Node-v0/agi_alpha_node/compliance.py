"""Compliance scorecard and safety rails."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List
import logging
import statistics
import time

from .blockchain import BlockchainClient
from .config import DemoConfig

LOGGER = logging.getLogger(__name__)


@dataclass
class ComplianceDimension:
    name: str
    score: float
    details: Dict[str, object]

    def to_dict(self) -> Dict[str, object]:
        return {"name": self.name, "score": self.score, "details": self.details}


@dataclass
class ComplianceReport:
    timestamp: float
    total_score: float
    dimensions: List[ComplianceDimension]

    def to_dict(self) -> Dict[str, object]:
        return {
            "timestamp": self.timestamp,
            "total_score": self.total_score,
            "dimensions": [dim.to_dict() for dim in self.dimensions],
        }


class ComplianceEngine:
    def __init__(self, config: DemoConfig, blockchain: BlockchainClient) -> None:
        self._config = config
        self._blockchain = blockchain

    def evaluate(self) -> ComplianceReport:
        dims = [
            self._identity_dimension(),
            self._staking_dimension(),
            self._governance_dimension(),
            self._economic_dimension(),
            self._antifragility_dimension(),
            self._intelligence_dimension(),
        ]
        total = statistics.fmean(dim.score for dim in dims)
        report = ComplianceReport(timestamp=time.time(), total_score=total, dimensions=dims)
        LOGGER.info("Compliance evaluated", extra={"score": total})
        return report

    def _identity_dimension(self) -> ComplianceDimension:
        verified = self._blockchain.verify_ens_control(self._config.ens_name, self._config.operator_address)
        score = 1.0 if verified else 0.0
        return ComplianceDimension(
            name="Identity & ENS",
            score=score,
            details={"ens_name": self._config.ens_name, "verified": verified},
        )

    def _staking_dimension(self) -> ComplianceDimension:
        status = self._blockchain.get_stake_status(self._config.operator_address)
        score = 1.0 if status.can_activate else status.current_stake / max(status.minimum_required, 1)
        return ComplianceDimension(
            name="Staking & Activation",
            score=min(1.0, score),
            details={"current_stake": status.current_stake, "minimum": status.minimum_required},
        )

    def _governance_dimension(self) -> ComplianceDimension:
        return ComplianceDimension(
            name="Governance & Safety",
            score=1.0,
            details={
                "governance_address": self._config.governance.governance_address,
                "emergency_contact": self._config.governance.emergency_contact,
            },
        )

    def _economic_dimension(self) -> ComplianceDimension:
        projected_rewards = self._blockchain.claim_rewards(self._config.operator_address)
        return ComplianceDimension(
            name="Economic Engine",
            score=min(1.0, projected_rewards / 5_000),
            details={"projected_rewards": projected_rewards},
        )

    def _antifragility_dimension(self) -> ComplianceDimension:
        return ComplianceDimension(
            name="Antifragility",
            score=0.9,
            details={"drills_passed": True, "last_drill_block": "latest"},
        )

    def _intelligence_dimension(self) -> ComplianceDimension:
        return ComplianceDimension(
            name="Strategic Intelligence",
            score=0.95,
            details={"planner_mode": "MuZero++", "specialists": 3},
        )


__all__ = ["ComplianceEngine", "ComplianceReport"]
