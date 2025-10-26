"""Persistence utilities for the omega upgrade."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from .jobs import JobRecord
from .resources import ResourceManager


class CheckpointManager:
    """Persist orchestrator state to disk."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def save(self, jobs: Dict[str, JobRecord], resources: ResourceManager) -> None:
        payload: Dict[str, Any] = {
            "jobs": {job_id: asdict(record) for job_id, record in jobs.items()},
            "resources": resources.snapshot_accounts(),
        }
        self._path.write_text(json.dumps(payload, default=str, indent=2))

    def load(self) -> Dict[str, Any] | None:
        if not self._path.exists():
            return None
        return json.loads(self._path.read_text())
