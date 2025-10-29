"""Governance and pause controls."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Dict, Optional


@dataclass
class GovernanceState:
    owner_address: str
    governance_address: str
    paused: bool = False
    last_action: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(
            {
                "owner_address": self.owner_address,
                "governance_address": self.governance_address,
                "paused": self.paused,
                "last_action": self.last_action,
            }
        )


class GovernanceController:
    """Enforces owner sovereignty."""

    def __init__(self, owner_address: str, governance_address: str) -> None:
        self._state = GovernanceState(owner_address=owner_address, governance_address=governance_address)

    @property
    def state(self) -> GovernanceState:
        return self._state

    def transfer_governance(self, new_governance_address: str) -> None:
        self._state.governance_address = new_governance_address
        self._state.last_action = f"governance_transfer:{datetime.now(UTC).isoformat()}"

    def transfer_ownership(self, new_owner_address: str) -> None:
        self._state.owner_address = new_owner_address
        self._state.last_action = f"ownership_transfer:{datetime.now(UTC).isoformat()}"

    def pause_all(self) -> None:
        self._state.paused = True
        self._state.last_action = f"pause:{datetime.now(UTC).isoformat()}"

    def resume_all(self) -> None:
        self._state.paused = False
        self._state.last_action = f"resume:{datetime.now(UTC).isoformat()}"

    def export_state(self) -> Dict[str, str]:
        return {
            "owner": self._state.owner_address,
            "governance": self._state.governance_address,
            "paused": str(self._state.paused),
        }
