"""Compliance scorecard generator."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .config import ComplianceConfig
from .economy import EconomyEngine
from .governance import GovernanceController
from .identity import ENSVerificationResult
from .planner import MuZeroPlanner


@dataclass
class ComplianceSnapshot:
    dimensions: Dict[str, float]
    overall: float


class ComplianceScorecard:
    """Scores the node across institutional safety dimensions."""

    def __init__(self, config: ComplianceConfig) -> None:
        self._config = config

    def compute(
        self,
        ens: ENSVerificationResult,
        economy: EconomyEngine,
        governance: GovernanceController,
        planner: MuZeroPlanner,
    ) -> ComplianceSnapshot:
        dimensions = {
            "identity": 1.0 if ens.is_verified else 0.0,
            "governance": 1.0 if not governance.state.paused else 0.2,
            "staking": min(1.0, economy.state.stake.amount / economy.config.minimum_stake),
            "economic_engine": 0.8 + min(0.2, economy.state.reinvested / (economy.state.stake.amount + 1e-9)),
            "antifragility": 0.9,
            "strategic_intelligence": 0.8 + min(0.2, max(planner.improvement_trend(), 0)),
        }
        overall = sum(dimensions.values()) / len(dimensions)
        return ComplianceSnapshot(dimensions=dimensions, overall=overall)

    def export_state(self, snapshot: ComplianceSnapshot) -> Dict[str, float]:
        state = dict(snapshot.dimensions)
        state["overall"] = snapshot.overall
        return state
