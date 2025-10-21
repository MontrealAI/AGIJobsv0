"""Governance utilities that model a timelocked control plane for the demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Callable, Dict, Iterable, Mapping
from uuid import uuid4

from .admin import OwnerConsole


@dataclass(frozen=True)
class TimelockedAction:
    """Represents a privileged action scheduled through the governance timelock."""

    action_id: str
    name: str
    payload: Mapping[str, object]
    eta: datetime
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    executed_at: datetime | None = None
    cancelled_at: datetime | None = None

    @property
    def status(self) -> str:
        if self.cancelled_at:
            return "CANCELLED"
        if self.executed_at:
            return "EXECUTED"
        return "QUEUED"

    def to_dict(self) -> Dict[str, object]:
        return {
            "action_id": self.action_id,
            "name": self.name,
            "payload": dict(self.payload),
            "eta": self.eta.isoformat(),
            "created_at": self.created_at.isoformat(),
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "status": self.status,
        }


class GovernanceTimelock:
    """Queues and executes owner actions after a configurable delay."""

    _ACTIONS: Dict[str, Callable[[OwnerConsole, Mapping[str, object]], None]] = {
        "update_reward_policy": lambda console, payload: console.update_reward_policy(**payload),
        "update_stake_policy": lambda console, payload: console.update_stake_policy(**payload),
        "update_evolution_policy": lambda console, payload: console.update_evolution_policy(**payload),
        "set_paused": lambda console, payload: console.set_paused(bool(payload["value"])),
        "pause": lambda console, payload: console.pause(),
        "resume": lambda console, payload: console.resume(),
    }

    def __init__(self, default_delay: timedelta | None = None) -> None:
        self.default_delay = default_delay or timedelta(seconds=0)
        self._scheduled: Dict[str, TimelockedAction] = {}

    # ------------------------------------------------------------------
    # Scheduling API
    def schedule(
        self,
        name: str,
        payload: Mapping[str, object],
        *,
        delay: timedelta | None = None,
    ) -> TimelockedAction:
        if name not in self._ACTIONS:
            raise ValueError(f"unknown timelock action: {name}")
        eta = datetime.now(UTC) + (delay or self.default_delay)
        action = TimelockedAction(
            action_id=f"tl-{uuid4().hex}",
            name=name,
            payload=dict(payload),
            eta=eta,
        )
        self._scheduled[action.action_id] = action
        return action

    def cancel(self, action_id: str) -> TimelockedAction:
        action = self._require_action(action_id)
        if action.executed_at:
            raise ValueError("cannot cancel an executed action")
        if action.cancelled_at:
            return action
        cancelled = TimelockedAction(
            action_id=action.action_id,
            name=action.name,
            payload=action.payload,
            eta=action.eta,
            created_at=action.created_at,
            executed_at=action.executed_at,
            cancelled_at=datetime.now(UTC),
        )
        self._scheduled[action_id] = cancelled
        return cancelled

    def execute_due(
        self,
        owner_console: OwnerConsole,
        *,
        now: datetime | None = None,
    ) -> Iterable[TimelockedAction]:
        moment = now or datetime.now(UTC)
        executed: list[TimelockedAction] = []
        for action_id, action in list(self._scheduled.items()):
            if action.cancelled_at or action.executed_at:
                continue
            if action.eta > moment:
                continue
            handler = self._ACTIONS[action.name]
            handler(owner_console, action.payload)
            completed = TimelockedAction(
                action_id=action.action_id,
                name=action.name,
                payload=action.payload,
                eta=action.eta,
                created_at=action.created_at,
                executed_at=moment,
            )
            self._scheduled[action_id] = completed
            executed.append(completed)
        return executed

    # ------------------------------------------------------------------
    # Introspection helpers
    def pending(self) -> Iterable[TimelockedAction]:
        return tuple(self._scheduled.values())

    # ------------------------------------------------------------------
    def _require_action(self, action_id: str) -> TimelockedAction:
        if action_id not in self._scheduled:
            raise KeyError(f"no such action: {action_id}")
        return self._scheduled[action_id]


__all__ = ["GovernanceTimelock", "TimelockedAction"]
