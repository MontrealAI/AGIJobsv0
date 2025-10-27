"""Checkpoint and recovery utilities."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional


class CheckpointManager:
    """Durable persistence for orchestrator state using JSON snapshots."""

    def __init__(self, path: str, version: str = "1.0") -> None:
        self.path = Path(path)
        self.version = version
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def save(self, state: Dict[str, Any]) -> str:
        payload = {
            "version": self.version,
            "timestamp": time.time(),
            "state": state,
        }
        with self.path.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, indent=2, sort_keys=True)
        return str(self.path)

    def load(self) -> Optional[Dict[str, Any]]:
        if not self.path.exists():
            return None
        with self.path.open("r", encoding="utf-8") as fp:
            payload = json.load(fp)
        if payload.get("version") != self.version:
            return None
        return payload.get("state")

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()
