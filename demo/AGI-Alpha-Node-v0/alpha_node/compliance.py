"""Compliance scorecard for the demo."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from .config import ComplianceSettings
from .ens import ENSVerificationResult
from .stake import StakeManager
from .state import StateStore


@dataclass(slots=True)
class ComplianceDimension:
    name: str
    score: float
    rationale: str


@dataclass(slots=True)
class ComplianceReport:
    overall: float
    dimensions: Dict[str, ComplianceDimension]


class ComplianceEngine:
    def __init__(
        self,
        settings: ComplianceSettings,
        store: StateStore,
        stake_manager: StakeManager,
    ) -> None:
        self.settings = settings
        self.store = store
        self.stake_manager = stake_manager

    def evaluate(self, ens_result: ENSVerificationResult) -> ComplianceReport:
        state = self.store.read()
        dimensions: Dict[str, ComplianceDimension] = {}

        dimensions["identity"] = ComplianceDimension(
            name="Identity & ENS",
            score=1.0 if ens_result.verified else 0.0,
            rationale=f"ENS verified via {ens_result.source}",
        )
        dimensions["staking"] = ComplianceDimension(
            name="Staking & Activation",
            score=1.0 if self.stake_manager.meets_minimum() else 0.0,
            rationale=f"Locked {state.stake_locked} {self.stake_manager.settings.asset_symbol}",
        )
        dimensions["governance"] = ComplianceDimension(
            name="Governance & Safety",
            score=0.0 if state.paused else 1.0,
            rationale=(
                "System pause engaged"
                if state.paused
                else "System active"
            )
            + (
                f" ({state.pause_reason})" if state.pause_reason else ""
            ),
        )
        dimensions["economic"] = ComplianceDimension(
            name="Economic Engine",
            score=min(1.0, state.total_rewards / max(1.0, self.settings.strategic_alpha_target)),
            rationale=f"Total rewards {state.total_rewards:.2f}",
        )
        dimensions["antifragile"] = ComplianceDimension(
            name="Antifragility",
            score=min(1.0, state.antifragility_index / self.settings.antifragility_target),
            rationale=f"Antifragility index {state.antifragility_index:.2f}",
        )
        dimensions["strategic"] = ComplianceDimension(
            name="Strategic Intelligence",
            score=min(1.0, state.strategic_alpha_index / self.settings.strategic_alpha_target),
            rationale=f"Strategic alpha {state.strategic_alpha_index:.2f}",
        )
        overall = sum(d.score for d in dimensions.values()) / len(dimensions)
        self.store.update(compliance_score=round(overall, 3))
        return ComplianceReport(overall=round(overall, 3), dimensions=dimensions)


__all__ = ["ComplianceEngine", "ComplianceReport", "ComplianceDimension"]
