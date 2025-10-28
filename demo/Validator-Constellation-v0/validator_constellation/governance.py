"""Owner governance controls for the Validator Constellation demo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable

from .config import SystemConfig
from .events import EventBus
from .sentinel import DomainPauseController
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
    ) -> None:
        self._owner = owner_address.lower()
        self._config = config
        self._pause_controller = pause_controller
        self._stake_manager = stake_manager
        self._event_bus = event_bus
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
        self._pause_controller.resume(domain, operator=caller)
        action = OwnerAction(operator=self._owner, action="domain-resume", details={"domain": domain})
        self._actions.append(action)
        return action

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

