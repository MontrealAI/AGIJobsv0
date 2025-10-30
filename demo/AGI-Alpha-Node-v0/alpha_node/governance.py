"""Governance control utilities for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from .config import GovernanceSettings
from .state import StateStore


@dataclass(slots=True)
class GovernanceStatus:
    governance_address: str
    emergency_multisig: str
    paused: bool
    last_event: str


class GovernanceController:
    """High-level operations for governance primitives."""

    def __init__(self, settings: GovernanceSettings, store: StateStore) -> None:
        self.settings = settings
        self.store = store
        self.store.update(
            governance_address=settings.governance_address,
            owner_address=settings.emergency_multisig,
        )

    def pause_all(self, reason: str = "manual pause") -> GovernanceStatus:
        state = self.store.update(paused=True, pause_reason=reason)
        self.store.append_audit(f"[{datetime.now(UTC).isoformat()}Z] pause: {reason}")
        return GovernanceStatus(
            governance_address=state.governance_address,
            emergency_multisig=self.settings.emergency_multisig,
            paused=True,
            last_event=reason,
        )

    def resume_all(self, reason: str = "manual resume") -> GovernanceStatus:
        state = self.store.update(paused=False, pause_reason="")
        self.store.append_audit(f"[{datetime.now(UTC).isoformat()}Z] resume: {reason}")
        return GovernanceStatus(
            governance_address=state.governance_address,
            emergency_multisig=self.settings.emergency_multisig,
            paused=False,
            last_event=reason,
        )

    def rotate_governance(self, new_address: str) -> GovernanceStatus:
        state = self.store.update(governance_address=new_address)
        self.store.append_audit(
            f"[{datetime.now(UTC).isoformat()}Z] governance-rotation: {new_address}"
        )
        return GovernanceStatus(
            governance_address=new_address,
            emergency_multisig=self.settings.emergency_multisig,
            paused=state.paused,
            last_event=f"rotated governance to {new_address}",
        )


__all__ = ["GovernanceController", "GovernanceStatus"]
