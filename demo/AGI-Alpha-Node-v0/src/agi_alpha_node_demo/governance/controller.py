from __future__ import annotations

import dataclasses
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List

from ..config import GovernanceConfig
from ..metrics.exporter import MetricRegistry
from ..safety.pause import PauseController

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GovernanceState:
    """In-memory snapshot of governance-critical addresses and flags."""

    owner_address: str
    governance_address: str
    paused: bool = False


@dataclass(slots=True)
class GovernanceEvent:
    """Audit-friendly record of governance changes."""

    timestamp: float
    actor: str
    action: str
    details: Dict[str, str] = field(default_factory=dict)


class GovernanceController:
    """Operator-facing governance orchestrator.

    The controller gives the operator explicit, auditable control over the
    Alpha Node's sovereign parameters. All updates require either the
    configured owner or governance authority and are durably recorded for
    compliance and for the dashboard/metrics surfaces.
    """

    def __init__(
        self,
        config: GovernanceConfig,
        pause_controller: PauseController,
        metrics: MetricRegistry | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self._pause_controller = pause_controller
        self._metrics = metrics
        self._state = GovernanceState(
            owner_address=config.owner_address,
            governance_address=config.governance_address,
            paused=pause_controller.is_paused(),
        )
        self._history: List[GovernanceEvent] = []
        self._record_event(
            actor=config.owner_address,
            action="governance_initialized",
            details={
                "owner": config.owner_address,
                "governance": config.governance_address,
            },
        )

    def snapshot(self) -> GovernanceState:
        with self._lock:
            return dataclasses.replace(self._state)

    def history(self) -> List[GovernanceEvent]:
        with self._lock:
            return list(self._history)

    # -- Update operations -------------------------------------------------

    def update_owner(self, new_owner: str, caller: str) -> GovernanceState:
        with self._lock:
            self._ensure_authorized(caller)
            previous = self._state.owner_address
            self._state.owner_address = new_owner
            self._record_event(
                actor=caller,
                action="owner_updated",
                details={"previous_owner": previous, "new_owner": new_owner},
            )
            return dataclasses.replace(self._state)

    def update_governance(self, new_governance: str, caller: str) -> GovernanceState:
        with self._lock:
            self._ensure_authorized(caller)
            previous = self._state.governance_address
            self._state.governance_address = new_governance
            self._record_event(
                actor=caller,
                action="governance_updated",
                details={"previous_governance": previous, "new_governance": new_governance},
            )
            return dataclasses.replace(self._state)

    def pause_all(self, caller: str) -> GovernanceState:
        with self._lock:
            self._ensure_authorized(caller)
            if not self._state.paused:
                self._pause_controller.pause()
                self._state.paused = True
                self._record_event(actor=caller, action="system_paused", details={})
            return dataclasses.replace(self._state)

    def resume_all(self, caller: str) -> GovernanceState:
        with self._lock:
            self._ensure_authorized(caller)
            if self._state.paused:
                self._pause_controller.resume()
                self._state.paused = False
                self._record_event(actor=caller, action="system_resumed", details={})
            return dataclasses.replace(self._state)

    # -- Internal helpers --------------------------------------------------

    def _ensure_authorized(self, caller: str) -> None:
        if caller.lower() not in {
            self._state.owner_address.lower(),
            self._state.governance_address.lower(),
        }:
            logger.error("Unauthorized governance mutation", extra={"context": {"caller": caller}})
            raise PermissionError("Caller is not authorized to perform governance updates")

    def _record_event(self, actor: str, action: str, details: Dict[str, str]) -> None:
        event = GovernanceEvent(timestamp=time.time(), actor=actor, action=action, details=details)
        self._history.append(event)
        logger.info("Governance event", extra={"context": dataclasses.asdict(event)})
        self._sync_metrics()

    def _sync_metrics(self) -> None:
        if not self._metrics:
            return
        self._metrics.set_metric("agi_alpha_node_governance_events_total", float(len(self._history)))
        self._metrics.set_metric("agi_alpha_node_governance_paused", 1.0 if self._state.paused else 0.0)
