"""Owner governance console and Ethereum logging stubs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from .config import DemoConfig
from .sentinel import Sentinel
from .telemetry import TelemetryEvent, TelemetryWriter


@dataclass
class GovernanceChange:
    section: str
    key: str
    old_value: Any
    new_value: Any


class GovernanceConsole:
    """Allows contract owner style updates to demo configuration."""

    def __init__(self, config: DemoConfig, telemetry: TelemetryWriter) -> None:
        self.config = config
        self.telemetry = telemetry

    def update(self, section: str, key: str, value: Any) -> GovernanceChange:
        target = getattr(self.config, section)
        old_value = getattr(target, key)
        setattr(target, key, value)
        self.telemetry.emit(
            [
                TelemetryEvent(
                    event_type="GovernanceUpdate",
                    payload={
                        "section": section,
                        "key": key,
                        "old": old_value,
                        "new": value,
                    },
                )
            ]
        )
        return GovernanceChange(section=section, key=key, old_value=old_value, new_value=value)

    def persist(self, path: str) -> None:
        self.config.dump(path)


class EthereumLogger:
    """Stub that represents on-chain telemetry emission."""

    def __init__(self, config: DemoConfig, telemetry: TelemetryWriter) -> None:
        self.config = config
        self.telemetry = telemetry

    def emit_call(self, record: Dict[str, Any]) -> None:
        payload = {
            "rpc_url": self.config.ethereum.rpc_url,
            "contract": self.config.ethereum.logging_contract,
            "chain_id": self.config.ethereum.chain_id,
            "record": record,
        }
        self.telemetry.emit([TelemetryEvent(event_type="EthereumLog", payload=payload)])


def pause_via_governance(sentinel: Sentinel, telemetry: TelemetryWriter, reason: str = "manual override") -> None:
    status = sentinel.force_pause(reason)
    telemetry.emit([
        TelemetryEvent(
            event_type="GovernancePause",
            payload={"reason": status.reason},
        )
    ])


__all__ = [
    "EthereumLogger",
    "GovernanceChange",
    "GovernanceConsole",
    "pause_via_governance",
]
