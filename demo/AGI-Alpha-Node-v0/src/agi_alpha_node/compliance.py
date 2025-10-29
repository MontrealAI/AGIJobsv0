"""Compliance scorecard generation."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict

from rich.console import Console
from rich.table import Table

from .ens import ENSVerificationResult
from .staking import StakeStatus

LOGGER = logging.getLogger("agi_alpha_node")


@dataclass
class ComplianceSnapshot:
    scores: Dict[str, float]

    @property
    def aggregate(self) -> float:
        return sum(self.scores.values()) / len(self.scores)

    def mermaid(self) -> str:
        lines = ["radar", "    title Compliance Dimensions"]
        for key, value in self.scores.items():
            lines.append(f'    "{key}" {value:.2f}')
        return "\n".join(lines)

    def render(self, console: Console) -> None:
        table = Table(title="Compliance Scorecard")
        table.add_column("Dimension")
        table.add_column("Score")
        for key, value in self.scores.items():
            table.add_row(key, f"{value:.2f}")
        table.add_row("Aggregate", f"{self.aggregate:.2f}")
        console.print(table)


class ComplianceEngine:
    def build_snapshot(
        self,
        *,
        ens: ENSVerificationResult,
        stake: StakeStatus,
        governance_ready: bool,
        antifragile_health: float,
        intelligence_velocity: float,
    ) -> ComplianceSnapshot:
        scores = {
            "Identity & ENS": 0.95 if ens.success else 0.1,
            "Staking & Activation": min(1.0, stake.staked_amount / max(stake.minimum_required, 1)),
            "Governance & Safety": 0.95 if governance_ready else 0.5,
            "Economic Engine": min(1.0, (stake.rewards_available + stake.staked_amount) / (stake.minimum_required * 1.5)),
            "Antifragility": antifragile_health,
            "Strategic Intelligence": intelligence_velocity,
        }
        LOGGER.info("Compliance snapshot computed", extra={"event": "compliance", "data": scores})
        return ComplianceSnapshot(scores)


__all__ = ["ComplianceEngine", "ComplianceSnapshot"]
