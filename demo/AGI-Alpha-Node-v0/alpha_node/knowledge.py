"""Persistent knowledge lake for specialists and planner."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from .logging_utils import get_logger

LOGGER = get_logger(__name__)


@dataclass(slots=True)
class KnowledgeRecord:
    job_id: str
    domain: str
    insight: str
    reward_delta: float


class KnowledgeLake:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_path.exists():
            self._write([])

    def _read(self) -> List[Dict[str, object]]:
        with self.storage_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, payload: List[Dict[str, object]]) -> None:
        with self.storage_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    def add(self, record: KnowledgeRecord) -> None:
        payload = self._read()
        payload.append(
            {
                "job_id": record.job_id,
                "domain": record.domain,
                "insight": record.insight,
                "reward_delta": record.reward_delta,
            }
        )
        self._write(payload)
        LOGGER.debug("Knowledge stored | job=%s domain=%s", record.job_id, record.domain)

    def search(self, domain: str) -> List[KnowledgeRecord]:
        results = [
            KnowledgeRecord(**item)
            for item in self._read()
            if item["domain"].lower() == domain.lower()
        ]
        LOGGER.debug("Knowledge search | domain=%s results=%s", domain, len(results))
        return results

    def latest(self, limit: int = 5) -> List[KnowledgeRecord]:
        return [KnowledgeRecord(**item) for item in self._read()[-limit:]]


__all__ = ["KnowledgeLake", "KnowledgeRecord"]
