"""Persistent state helpers for the AGI Alpha Node demo."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock
from typing import Any, Dict


@dataclass
class NodeState:
    paused: bool = False
    total_rewards: float = 0.0
    active_jobs: int = 0
    knowledge_entries: int = 0
    antifragility_index: float = 1.0
    strategic_alpha_index: float = 1.0
    governance_address: str = ""
    owner_address: str = ""
    stake_locked: float = 0.0
    audit_log: list[str] = field(default_factory=list)


class StateStore:
    """A tiny thread-safe JSON state store."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = RLock()
        if not self.path.exists():
            self.write(NodeState())

    def read(self) -> NodeState:
        with self._lock:
            data = json.loads(self.path.read_text())
            return NodeState(**data)

    def write(self, state: NodeState) -> None:
        with self._lock:
            payload: Dict[str, Any] = state.__dict__.copy()
            self.path.write_text(json.dumps(payload, indent=2, sort_keys=True))

    def update(self, **changes: Any) -> NodeState:
        with self._lock:
            state = self.read()
            for key, value in changes.items():
                setattr(state, key, value)
            self.write(state)
            return state

    def append_audit(self, message: str) -> None:
        with self._lock:
            state = self.read()
            state.audit_log.append(message)
            self.write(state)


__all__ = ["NodeState", "StateStore"]
