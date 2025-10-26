"""Governance controls for the demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from typing import Dict, List

from .config import DemoConfig
from .logging_utils import log_json

logger = logging.getLogger(__name__)


@dataclass
class GovernanceEvent:
    timestamp: datetime
    actor: str
    action: str
    payload: Dict[str, str]

    def to_dict(self) -> Dict[str, str]:
        payload = dict(self.payload)
        payload.update({"timestamp": self.timestamp.isoformat(), "actor": self.actor, "action": self.action})
        return payload


class GovernanceConsole:
    """Simplified governance facade for the operator."""

    def __init__(self, config: DemoConfig) -> None:
        self._config = config
        self._paused = False
        self._events: List[GovernanceEvent] = []

    @property
    def paused(self) -> bool:
        return self._paused

    def pause(self, *, caller: str) -> None:
        self._require_owner(caller)
        self._paused = True
        self._record(caller, "pause", {})
        log_json(logger, "system_paused", caller=caller)

    def resume(self, *, caller: str) -> None:
        self._require_owner(caller)
        self._paused = False
        self._record(caller, "resume", {})
        log_json(logger, "system_resumed", caller=caller)

    def configure(self, *, caller: str, **params: str) -> None:
        self._config.update(caller=caller, **params)
        self._record(caller, "configure", {k: str(v) for k, v in params.items()})
        log_json(logger, "configuration_updated", caller=caller, params=params)

    def _require_owner(self, caller: str) -> None:
        if caller != self._config.owner:
            raise PermissionError("Only the owner can execute this action")

    def _record(self, actor: str, action: str, payload: Dict[str, str]) -> None:
        self._events.append(
            GovernanceEvent(timestamp=datetime.now(timezone.utc), actor=actor, action=action, payload=payload)
        )

    def audit_log(self) -> List[Dict[str, str]]:
        return [event.to_dict() for event in self._events]
