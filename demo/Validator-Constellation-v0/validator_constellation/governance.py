from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Mapping

from .config import SystemConfig
from .events import EventBus
from .sentinel import DomainPauseController
from .staking import StakeManager


@dataclass
class OwnerAction:
    action: str
    details: Dict[str, object]


class OwnerConsole:
    def __init__(
        self,
        owner: str,
        config: SystemConfig,
        pause_controller: DomainPauseController,
        stake_manager: StakeManager,
        bus: EventBus,
    ) -> None:
        self.owner = owner.lower()
        self.config = config
        self.pause_controller = pause_controller
        self.stake_manager = stake_manager
        self.bus = bus
        self.actions: List[OwnerAction] = []

    def _assert_owner(self, caller: str) -> None:
        if caller.lower() != self.owner:
            raise PermissionError("only owner may perform this action")

    def record(self, action: str, **details: object) -> OwnerAction:
        entry = OwnerAction(action, details)
        self.actions.append(entry)
        self.bus.emit("OwnerAction", action=action, details=details)
        return entry

    def update_config(self, caller: str, **updates: object) -> OwnerAction:
        self._assert_owner(caller)
        for key, value in updates.items():
            if not hasattr(self.config, key):
                raise AttributeError(key)
            setattr(self.config, key, value)
        self.bus.emit("ConfigUpdated", updates=updates)
        return self.record("config-update", **updates)

    def resume_domain(self, caller: str, domain: str) -> OwnerAction:
        self._assert_owner(caller)
        self.pause_controller.resume(domain, caller)
        return self.record("domain-resume", domain=domain)

    def execute_script(self, caller: str, actions: Mapping[str, object]) -> List[OwnerAction]:
        self._assert_owner(caller)
        executed: List[OwnerAction] = []
        for key, value in actions.items():
            if key == "updateSentinel" and isinstance(value, Mapping):
                executed.append(self.record("update-sentinel", **value))
            elif key == "updateDomainSafety" and isinstance(value, Iterable):
                for entry in value:
                    if isinstance(entry, Mapping) and "domainId" in entry:
                        self.pause_controller.update_domain(entry["domainId"], **{
                            "unsafe_opcodes": entry.get("unsafeOpcodes", []),
                            "allowed_targets": entry.get("allowedTargets", []),
                            "max_calldata_bytes": entry.get("maxCalldataBytes", self.config.default_domains[0]["max_calldata_bytes"]),
                            "forbidden_selectors": entry.get("forbiddenSelectors", []),
                        })
                        executed.append(self.record("update-domain", **entry))
            elif key == "pauseDomains" and isinstance(value, Iterable):
                for entry in value:
                    if isinstance(entry, Mapping):
                        self.pause_controller.pause(
                            entry["domainId"],
                            reason=entry.get("reason", "owner-scheduled"),
                            triggered_by=caller,
                        )
                        executed.append(self.record("domain-pause", **entry))
            elif key == "resumeDomains" and isinstance(value, Iterable):
                for entry in value:
                    if isinstance(entry, Mapping):
                        self.pause_controller.resume(entry["domainId"], entry.get("triggeredBy", caller))
                        executed.append(self.record("domain-resume", **entry))
            elif key == "setAgentBudgets" and isinstance(value, Iterable):
                for entry in value:
                    executed.append(self.record("set-agent-budget", **entry))
            elif key == "updateEntropy" and isinstance(value, Mapping):
                executed.append(self.record("update-entropy", **value))
            elif key == "updateZkKey":
                self.config.verifying_key = str(value)
                executed.append(self.record("update-zk-key", verifying_key=str(value)))
            elif key == "updateGovernance" and isinstance(value, Mapping):
                updates = {k: value[k] for k in ("commitPhaseBlocks", "revealPhaseBlocks") if k in value}
                for attr, val in updates.items():
                    setattr(self.config, attr[0].lower() + attr[1:], val)
                executed.append(self.record("update-governance", **value))
            elif key == "distributeTreasury" and isinstance(value, Iterable):
                for entry in value:
                    executed.append(self.record("treasury-distribution", **entry))
            elif key == "rotateEnsRegistry" and isinstance(value, Mapping):
                executed.append(self.record("rotate-ens", **value))
        return executed
