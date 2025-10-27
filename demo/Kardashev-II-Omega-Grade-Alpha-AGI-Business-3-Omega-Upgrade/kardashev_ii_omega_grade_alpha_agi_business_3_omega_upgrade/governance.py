"""Governance controls for the omega upgrade demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Dict, Optional


@dataclass
class GovernanceParameters:
    worker_stake_ratio: float = 0.12
    validator_stake: float = 50.0
    validator_commit_window: timedelta = timedelta(minutes=3)
    validator_reveal_window: timedelta = timedelta(minutes=3)
    validator_quorum: int = 3
    failure_slash_ratio: float = 0.5
    reward_burn_ratio: float = 0.02
    pause_enabled: bool = True
    governance_multisig: str = "omega-operator"


@dataclass
class GovernanceEvent:
    title: str
    details: Dict[str, str]


class GovernanceController:
    """Simple governance layer with audit trail and access control."""

    def __init__(self, params: GovernanceParameters | None = None) -> None:
        self.params = params or GovernanceParameters()
        self.audit_trail: list[GovernanceEvent] = []

    def update(self, actor: str, **kwargs: object) -> None:
        if actor != self.params.governance_multisig:
            raise PermissionError("Only governance multisig may update parameters")
        changes = {}
        for key, value in kwargs.items():
            if hasattr(self.params, key):
                setattr(self.params, key, value)
                changes[key] = str(value)
        if changes:
            self.audit_trail.append(GovernanceEvent(title="governance_update", details=changes))

    def require_quorum(self, approvals: int) -> bool:
        return approvals >= self.params.validator_quorum
