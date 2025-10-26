"""Governance parameters for the Omega-grade demo."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


@dataclass
class GovernanceParameters:
    worker_stake_ratio: float = 0.15
    validator_stake: float = 100.0
    validator_commit_window: timedelta = timedelta(minutes=5)
    validator_reveal_window: timedelta = timedelta(minutes=5)
    approvals_required: int = 2
    pause_enabled: bool = True
    slash_ratio: float = 0.5


class GovernanceController:
    """Simple container enforcing governance thresholds."""

    def __init__(self, params: GovernanceParameters) -> None:
        self.params = params

    def update(self, **changes: object) -> None:
        for key, value in changes.items():
            if hasattr(self.params, key):
                setattr(self.params, key, value)

    def require_quorum(self, approvals: int) -> bool:
        return approvals >= self.params.approvals_required

    def slash_amount(self, stake_locked: float) -> float:
        return stake_locked * self.params.slash_ratio

