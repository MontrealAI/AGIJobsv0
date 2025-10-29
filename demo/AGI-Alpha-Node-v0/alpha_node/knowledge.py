"""Knowledge lake implementation."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List, Optional

from .state import StateStore


@dataclass(slots=True)
class KnowledgeEntry:
    topic: str
    insight: str
    impact: float
    job_id: str


class KnowledgeLake:
    """Simple append-only knowledge store."""

    def __init__(self, path: Path, store: StateStore) -> None:
        self.path = path
        self.store = store
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text("[]")

    def _load(self) -> List[KnowledgeEntry]:
        payload = json.loads(self.path.read_text())
        return [KnowledgeEntry(**item) for item in payload]

    def _save(self, entries: Iterable[KnowledgeEntry]) -> None:
        payload = [asdict(entry) for entry in entries]
        self.path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))

    def add_entry(self, entry: KnowledgeEntry) -> None:
        entries = self._load()
        if not any(e.topic == entry.topic and e.insight == entry.insight for e in entries):
            entries.append(entry)
            self._save(entries)
            self.store.update(knowledge_entries=len(entries))

    def find(self, topic: str) -> Optional[KnowledgeEntry]:
        entries = self._load()
        ranked = sorted(
            (e for e in entries if topic.lower() in e.topic.lower()),
            key=lambda item: item.impact,
            reverse=True,
        )
        return ranked[0] if ranked else None

    def export(self) -> List[KnowledgeEntry]:
        return self._load()


__all__ = ["KnowledgeLake", "KnowledgeEntry"]
