"""Configurable governance controls for the demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Dict


@dataclass
class GovernanceParameters:
    worker_stake_ratio: float = 0.1
    validator_stake: float = 50.0
    validator_commit_window: timedelta = timedelta(minutes=10)
    validator_reveal_window: timedelta = timedelta(minutes=10)
    validator_quorum: int = 3
    failure_slash_ratio: float = 0.5
    reward_burn_ratio: float = 0.02
    pause_enabled: bool = True


@dataclass
class GovernanceEvent:
    title: str
    details: Dict[str, str]


class GovernanceController:
    """Simple governance layer exposing parameter updates."""

    def __init__(self, params: GovernanceParameters | None = None) -> None:
        self.params = params or GovernanceParameters()
        self.audit_trail: list[GovernanceEvent] = []

    def update(self, **kwargs: object) -> None:
        changes = {}
        for key, value in kwargs.items():
            if hasattr(self.params, key):
                setattr(self.params, key, value)
                changes[key] = str(value)
        if changes:
            self.audit_trail.append(GovernanceEvent(title="governance_update", details=changes))

    def require_quorum(self, approvals: int) -> bool:
        return approvals >= self.params.validator_quorum
