"""Persistent knowledge base used by specialists."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from .config import KnowledgeConfig


@dataclass
class KnowledgeEntry:
    topic: str
    content: str
    tags: List[str]

    def to_dict(self) -> Dict[str, object]:
        return {"topic": self.topic, "content": self.content, "tags": self.tags}


class KnowledgeLake:
    """Simple append-only knowledge store."""

    def __init__(self, config: KnowledgeConfig) -> None:
        self._config = config
        self._path = config.storage_path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("[]", encoding="utf-8")

    def add_entry(self, entry: KnowledgeEntry) -> None:
        entries = self._load()
        entries.append(entry.to_dict())
        if len(entries) > self._config.max_entries:
            entries = entries[-self._config.max_entries :]
        self._path.write_text(json.dumps(entries, indent=2), encoding="utf-8")

    def query(self, tag: str | None = None) -> Iterable[KnowledgeEntry]:
        for raw in self._load():
            if tag and tag not in raw.get("tags", []):
                continue
            yield KnowledgeEntry(topic=raw["topic"], content=raw["content"], tags=list(raw.get("tags", [])))

    def _load(self) -> List[Dict[str, object]]:
        data = json.loads(self._path.read_text(encoding="utf-8"))
        return list(data)

    def export_state(self) -> Dict[str, str]:
        entries = list(self.query())
        return {
            "entries": str(len(entries)),
            "recent_topic": entries[-1].topic if entries else "",
        }
