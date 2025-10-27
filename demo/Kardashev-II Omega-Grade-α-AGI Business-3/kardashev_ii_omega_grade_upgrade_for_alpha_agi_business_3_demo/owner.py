"""Operator control channel utilities."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict


class OwnerCommandStream:
    """Utility for emitting and acknowledging owner control commands."""

    def __init__(self, command_path: Path, ack_path: Path) -> None:
        self.command_path = command_path
        self.ack_path = ack_path
        self.command_path.parent.mkdir(parents=True, exist_ok=True)
        self.ack_path.parent.mkdir(parents=True, exist_ok=True)
        self._ack_lock = Lock()

    def send(self, payload: Dict[str, Any]) -> None:
        enriched = {
            **payload,
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }
        with self.command_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(enriched, sort_keys=True) + "\n")

    def acknowledge(self, payload: Dict[str, Any]) -> None:
        enriched = {
            **payload,
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._ack_lock:
            with self.ack_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(enriched, sort_keys=True) + "\n")
