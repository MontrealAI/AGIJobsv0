"""Governance and pause mechanisms for the Alpha Node."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from web3 import Web3

_LOGGER = logging.getLogger(__name__)


@dataclass
class GovernanceState:
    owner: str
    governance_address: str
    pause_contract: str
    paused: bool = False
    last_rotation: Optional[datetime] = None
    metadata: Dict[str, str] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(
            {
                "owner": self.owner,
                "governance_address": self.governance_address,
                "pause_contract": self.pause_contract,
                "paused": self.paused,
                "last_rotation": self.last_rotation.isoformat() if self.last_rotation else None,
                "metadata": self.metadata,
            },
            sort_keys=True,
        )


class SystemPauseManager:
    """Handles pause/unpause operations and governance rotations."""

    def __init__(self, web3: Web3, state_path: Path) -> None:
        self._web3 = web3
        self._state_path = state_path
        self._state: Optional[GovernanceState] = None
        self._state_path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def state(self) -> GovernanceState:
        if self._state is None:
            raise RuntimeError("Governance state not initialized")
        return self._state

    def bootstrap(self, owner: str, governance_address: str, pause_contract: str) -> GovernanceState:
        state = GovernanceState(
            owner=Web3.to_checksum_address(owner),
            governance_address=Web3.to_checksum_address(governance_address),
            pause_contract=Web3.to_checksum_address(pause_contract),
            paused=False,
        )
        self._state = state
        self._persist()
        _LOGGER.info("Governance bootstrap complete", extra={"state": state.to_json()})
        return state

    def load(self) -> GovernanceState:
        if not self._state_path.exists():
            raise FileNotFoundError("Governance state file missing; run bootstrap first")
        data = json.loads(self._state_path.read_text(encoding="utf-8"))
        self._state = GovernanceState(
            owner=data["owner"],
            governance_address=data["governance_address"],
            pause_contract=data["pause_contract"],
            paused=data.get("paused", False),
            last_rotation=datetime.fromisoformat(data["last_rotation"]) if data.get("last_rotation") else None,
            metadata=data.get("metadata", {}),
        )
        return self._state

    def pause(self, reason: str) -> GovernanceState:
        state = self.state
        if state.paused:
            _LOGGER.warning("Pause requested but system already paused", extra={"reason": reason})
            return state
        state.paused = True
        state.metadata["pause_reason"] = reason
        self._persist()
        _LOGGER.critical("System paused", extra={"reason": reason})
        return state

    def resume(self, note: str) -> GovernanceState:
        state = self.state
        if not state.paused:
            _LOGGER.warning("Resume requested but system already active", extra={"note": note})
            return state
        state.paused = False
        state.metadata["resume_note"] = note
        self._persist()
        _LOGGER.info("System resumed", extra={"note": note})
        return state

    def rotate_governance(self, new_governance_address: str, justification: str) -> GovernanceState:
        state = self.state
        state.governance_address = Web3.to_checksum_address(new_governance_address)
        state.last_rotation = datetime.now(timezone.utc)
        state.metadata["rotation_justification"] = justification
        self._persist()
        _LOGGER.info(
            "Governance rotated",
            extra={
                "new_governance_address": new_governance_address,
                "justification": justification,
                "timestamp": state.last_rotation.isoformat(),
            },
        )
        return state

    def _persist(self) -> None:
        assert self._state is not None
        self._state_path.write_text(self._state.to_json(), encoding="utf-8")
