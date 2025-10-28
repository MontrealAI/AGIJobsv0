from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Dict, Iterable, List, Optional


@dataclass
class KnowledgeEntry:
    timestamp: float
    domain: str
    metric: str
    value: float
    note: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "timestamp": self.timestamp,
            "domain": self.domain,
            "metric": self.metric,
            "value": self.value,
            "note": self.note,
        }


class KnowledgeLake:
    def __init__(self, storage_path: Path, retention_days: int, max_entries: int) -> None:
        self.storage_path = storage_path
        self.retention_seconds = retention_days * 86400
        self.max_entries = max_entries
        self._lock = Lock()
        self._entries: List[KnowledgeEntry] = []
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists():
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            return
        with self.storage_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                data = json.loads(line)
                self._entries.append(KnowledgeEntry(**data))
        self._enforce_limits()

    def _persist(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        with self.storage_path.open("w", encoding="utf-8") as handle:
            for entry in self._entries:
                handle.write(json.dumps(entry.as_dict()) + "\n")

    def _enforce_limits(self) -> None:
        cutoff = time.time() - self.retention_seconds
        self._entries = [entry for entry in self._entries if entry.timestamp >= cutoff]
        if len(self._entries) > self.max_entries:
            self._entries = self._entries[-self.max_entries :]

    def store(self, *, domain: str, metric: str, value: float, note: str) -> None:
        with self._lock:
            entry = KnowledgeEntry(time.time(), domain, metric, float(value), note)
            self._entries.append(entry)
            self._enforce_limits()
            self._persist()

    def filter(self, *, domain: Optional[str] = None, metric: Optional[str] = None) -> Iterable[Dict[str, float]]:
        for entry in list(self._entries):
            if domain and entry.domain != domain:
                continue
            if metric and entry.metric != metric:
                continue
            yield {"value": entry.value, "metric": entry.metric, "note": entry.note}

    def count(self, domain: Optional[str] = None) -> int:
        if domain is None:
            return len(self._entries)
        return sum(1 for entry in self._entries if entry.domain == domain)

    def recent_summary(self, domain: str, limit: int = 5) -> List[Dict[str, object]]:
        return [entry.as_dict() for entry in self._entries if entry.domain == domain][-limit:]

    def export(self) -> List[Dict[str, object]]:
        return [entry.as_dict() for entry in self._entries]
