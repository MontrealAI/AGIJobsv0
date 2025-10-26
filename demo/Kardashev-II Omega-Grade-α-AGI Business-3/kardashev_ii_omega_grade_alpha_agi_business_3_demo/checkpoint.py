"""Checkpointing utilities for long-running orchestrator sessions."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Iterable, Mapping

from .jobs import JobRecord
from .resources import ResourceManager


class CheckpointManager:
    """Persist orchestrator state between runs."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def save(self, jobs: Mapping[str, JobRecord], resources: ResourceManager) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "jobs": {job_id: record.to_serializable() for job_id, record in jobs.items()},
            "resources": resources.to_serializable(),
        }
        tmp_path = self.path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self.path)

    def load(self) -> Dict[str, object]:
        if not self.path.exists():
            return {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        if not isinstance(payload, dict):
            return {}
        return payload
