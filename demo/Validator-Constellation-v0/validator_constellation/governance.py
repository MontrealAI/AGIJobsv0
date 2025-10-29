"""Owner governance controls for the Validator Constellation demo."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Iterable, Optional

from .config import SystemConfig
from .events import EventBus
from .sentinel import DomainPauseController, SentinelMonitor
from .staking import StakeManager


@dataclass(slots=True)
class OwnerAction:
    """Represents an action executed by the contract owner."""

    operator: str
    action: str
    details: Dict[str, object]


class OwnerConsole:
    """High-level facade that mimics contract owner privileges."""

    def __init__(
        self,
        owner_address: str,
        config: SystemConfig,
        pause_controller: DomainPauseController,
        stake_manager: StakeManager,
        event_bus: EventBus,
        sentinel: Optional[SentinelMonitor] = None,
    ) -> None:
        self._owner = owner_address.lower()
        self._config = config
        self._pause_controller = pause_controller
        self._stake_manager = stake_manager
        self._event_bus = event_bus
        self._sentinel = sentinel
        self._actions: list[OwnerAction] = []

    def _require_owner(self, caller: str) -> None:
        if caller.lower() != self._owner:
            raise PermissionError("Caller is not the contract owner")

    def update_config(self, caller: str, **changes: object) -> OwnerAction:
        self._require_owner(caller)
        if not changes:
            raise ValueError("No configuration changes provided")
        validated: Dict[str, object] = {}
        for key, value in changes.items():
            if not hasattr(self._config, key):
                raise AttributeError(f"Unknown configuration field: {key}")
            validated[key] = value
        self._config.update(**validated)
        action = OwnerAction(operator=self._owner, action="config-update", details=validated)
        self._actions.append(action)
        self._event_bus.publish(
            "ConfigUpdated",
            {"owner": self._owner, "changes": validated},
        )
        return action

    def resume_domain(self, caller: str, domain: str) -> OwnerAction:
        self._require_owner(caller)
        if self._sentinel:
            self._sentinel.resume_domain(domain, caller)
        else:
            self._pause_controller.resume(domain, operator=caller)
        action = OwnerAction(operator=self._owner, action="domain-resume", details={"domain": domain})
        self._actions.append(action)
        return action

    def pause_domain(self, caller: str, domain: str, reason: str, block_number: int | None = None) -> OwnerAction:
        self._require_owner(caller)
        record = self._pause_controller.pause(
            domain,
            reason=reason,
            triggered_by="owner",
            block_number=block_number,
            metadata={"operator": caller.lower()},
        )
        action = OwnerAction(
            operator=self._owner,
            action="domain-pause",
            details={
                "domain": domain,
                "reason": reason,
                "pausedAt": record.timestamp.isoformat(),
            },
        )
        self._actions.append(action)
        return action

    def update_domain_policy(self, caller: str, domain: str, **changes: object) -> OwnerAction:
        self._require_owner(caller)
        updated = self._pause_controller.update_domain(domain, **changes)
        action = OwnerAction(
            operator=self._owner,
            action="domain-policy-update",
            details={
                "domain": domain,
                "changes": changes,
                "budgetLimit": float(updated.budget_limit),
            },
        )
        self._actions.append(action)
        return action

    def update_sentinel(self, caller: str, *, budget_grace_ratio: float | None = None) -> OwnerAction:
        self._require_owner(caller)
        if not self._sentinel:
            raise RuntimeError("Sentinel monitor not configured")
        details: Dict[str, object] = {}
        if budget_grace_ratio is not None:
            self._sentinel.update_budget_grace_ratio(budget_grace_ratio)
            details["budgetGraceRatio"] = budget_grace_ratio
        if not details:
            raise ValueError("No sentinel updates provided")
        action = OwnerAction(operator=self._owner, action="sentinel-update", details=details)
        self._actions.append(action)
        self._event_bus.publish("SentinelConfigUpdated", {"owner": self._owner, **details})
        return action

    def attach_sentinel(self, sentinel: SentinelMonitor) -> None:
        self._sentinel = sentinel

    def distribute_treasury(
        self,
        caller: str,
        recipient: str,
        amount: float | str | int,
        note: str | None = None,
    ) -> OwnerAction:
        self._require_owner(caller)
        decimal_amount = Decimal(str(amount))
        self._stake_manager.distribute_treasury(recipient, decimal_amount, note)
        action = OwnerAction(
            operator=self._owner,
            action="treasury-distribution",
            details={
                "recipient": recipient.lower(),
                "amount": float(decimal_amount),
                "note": note,
            },
        )
        self._actions.append(action)
        return action

    def record_custom_action(self, *, action: str, details: Dict[str, object]) -> OwnerAction:
        entry = OwnerAction(operator=self._owner, action=action, details=details)
        self._actions.append(entry)
        self._event_bus.publish(
            "OwnerActionRecorded",
            {"owner": self._owner, "action": action, "details": details},
        )
        return entry

    def deactivate_validator(self, caller: str, address: str) -> OwnerAction:
        self._require_owner(caller)
        self._stake_manager.deactivate(address)
        action = OwnerAction(
            operator=self._owner,
            action="validator-deactivate",
            details={"address": address.lower()},
        )
        self._actions.append(action)
        return action

    @property
    def actions(self) -> Iterable[OwnerAction]:
        return tuple(self._actions)

