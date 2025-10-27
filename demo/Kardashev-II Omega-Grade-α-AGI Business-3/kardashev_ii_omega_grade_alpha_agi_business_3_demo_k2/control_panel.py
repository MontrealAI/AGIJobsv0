"""Operator control utilities for the K2 Omega-grade demo."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional


@dataclass(slots=True)
class ControlChannel:
    """Represents the control file used by the orchestrator."""

    path: Path

    def append(self, payload: Mapping[str, Any]) -> None:
        envelope: Dict[str, Any] = {
            "issued_at": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(envelope, sort_keys=True) + "\n")


@dataclass(slots=True)
class OperatorControlPanel:
    """High-level helper exposing safe knobs to non-technical operators."""

    control_channel: ControlChannel
    status_log: Optional[Path] = None

    @classmethod
    def from_paths(cls, control_path: Path, status_path: Optional[Path] = None) -> "OperatorControlPanel":
        return cls(ControlChannel(control_path), status_path)

    # --- Core mission controls -------------------------------------------------
    def pause(self) -> None:
        self.control_channel.append({"action": "pause"})

    def resume(self) -> None:
        self.control_channel.append({"action": "resume"})

    def emergency_stop(self) -> None:
        self.control_channel.append({"action": "stop"})

    # --- Governance and resource adjustments ----------------------------------
    def update_governance(self, **parameters: Any) -> None:
        if not parameters:
            raise ValueError("No governance parameters supplied")
        payload: Dict[str, Any] = {
            "action": "update_parameters",
            "governance": parameters,
        }
        self.control_channel.append(payload)

    def set_operator_account(self, account: str) -> None:
        self.control_channel.append({"action": "set_account", "account": account})

    def adjust_resource_caps(
        self,
        *,
        energy_capacity: Optional[float] = None,
        compute_capacity: Optional[float] = None,
        energy_available: Optional[float] = None,
        compute_available: Optional[float] = None,
    ) -> None:
        resources: Dict[str, float] = {}
        if energy_capacity is not None:
            resources["energy_capacity"] = float(energy_capacity)
        if compute_capacity is not None:
            resources["compute_capacity"] = float(compute_capacity)
        if energy_available is not None:
            resources["energy_available"] = float(energy_available)
        if compute_available is not None:
            resources["compute_available"] = float(compute_available)
        if not resources:
            raise ValueError("No resource adjustments supplied")
        payload: Dict[str, Any] = {"action": "update_parameters", "resources": resources}
        self.control_channel.append(payload)

    def cancel_job(self, job_id: str, *, reason: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {"action": "cancel_job", "job_id": job_id}
        if reason:
            payload["reason"] = reason
        self.control_channel.append(payload)

    # --- Status inspection -----------------------------------------------------
    def recent_status(self, limit: int = 5) -> List[Dict[str, Any]]:
        if self.status_log is None or not self.status_log.exists():
            return []
        lines = self.status_log.read_text(encoding="utf-8").strip().splitlines()
        recent = lines[-limit:]
        snapshots: List[Dict[str, Any]] = []
        for line in recent:
            try:
                snapshots.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return snapshots

    def last_status(self) -> Optional[Dict[str, Any]]:
        snapshots = self.recent_status(limit=1)
        return snapshots[0] if snapshots else None


__all__ = ["OperatorControlPanel", "ControlChannel"]
