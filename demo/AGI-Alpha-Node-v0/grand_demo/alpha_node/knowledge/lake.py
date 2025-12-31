"""Persistent knowledge lake implementation."""
from __future__ import annotations

import hashlib
import json
import logging
import math
import pathlib
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class KnowledgeItem:
    key: str
    embedding: List[float]
    payload: Dict[str, str]


@dataclass(slots=True)
class KnowledgeEntry:
    topic: str
    insight: str
    impact: float
    job_id: str


@dataclass(slots=True)
class KnowledgeLake:
    path: pathlib.Path
    embedding_dim: int = 768
    similarity_threshold: float = 0.76
    _items: Dict[str, KnowledgeItem] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self._load()

    def _load(self) -> None:
        data = json.loads(self.path.read_text())
        self._items = {
            key: KnowledgeItem(key=key, embedding=item["embedding"], payload=item["payload"])
            for key, item in data.items()
        }
        logger.debug("Loaded knowledge items", extra={"count": len(self._items)})

    def _save(self) -> None:
        data = {
            key: {"embedding": item.embedding, "payload": item.payload} for key, item in self._items.items()
        }
        self.path.write_text(json.dumps(data, indent=2))
        logger.debug("Persisted knowledge items", extra={"count": len(self._items)})

    def _normalise(self, embedding: Iterable[float]) -> List[float]:
        vector = list(embedding)
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def _embed_text(self, text: str) -> List[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = []
        for index in range(self.embedding_dim):
            value = digest[index % len(digest)]
            values.append((value / 255.0) * 2 - 1)
        return self._normalise(values)

    def _entry_key(self, entry: KnowledgeEntry) -> str:
        seed = f"{entry.topic}:{entry.job_id}:{entry.insight}"
        return hashlib.blake2b(seed.encode("utf-8"), digest_size=16).hexdigest()

    def upsert(self, key: str, embedding: Iterable[float], payload: Dict[str, str]) -> None:
        normalised = self._normalise(embedding)
        self._items[key] = KnowledgeItem(key=key, embedding=normalised, payload=payload)
        self._save()
        logger.info("Upserted knowledge item", extra={"key": key})

    def query(self, embedding: Iterable[float], top_k: int = 5) -> List[Tuple[KnowledgeItem, float]]:
        target = self._normalise(embedding)
        results: List[Tuple[KnowledgeItem, float]] = []
        for item in self._items.values():
            similarity = sum(i * t for i, t in zip(item.embedding, target))
            if similarity >= self.similarity_threshold:
                results.append((item, similarity))
        results.sort(key=lambda pair: pair[1], reverse=True)
        logger.debug("Knowledge query", extra={"matches": len(results), "top_k": top_k})
        return results[:top_k]

    def erase(self, key: str) -> None:
        if key in self._items:
            del self._items[key]
            self._save()
            logger.info("Erased knowledge item", extra={"key": key})

    def add_entry(self, entry: KnowledgeEntry) -> None:
        payload = {
            "topic": entry.topic,
            "insight": entry.insight,
            "impact": f"{entry.impact:.6f}",
            "job_id": entry.job_id,
        }
        embedding = self._embed_text(f"{entry.topic} {entry.insight}")
        key = self._entry_key(entry)
        self._items[key] = KnowledgeItem(key=key, embedding=embedding, payload=payload)
        self._save()

    def export(self) -> List[KnowledgeEntry]:
        entries: List[KnowledgeEntry] = []
        for item in self._items.values():
            payload = item.payload
            if {"topic", "insight", "impact", "job_id"}.issubset(payload):
                try:
                    impact = float(payload["impact"])
                except (TypeError, ValueError):
                    impact = 0.0
                entries.append(
                    KnowledgeEntry(
                        topic=payload["topic"],
                        insight=payload["insight"],
                        impact=impact,
                        job_id=payload["job_id"],
                    )
                )
        return entries

    def find(self, topic: str) -> Optional[KnowledgeEntry]:
        matches = [entry for entry in self.export() if topic.lower() in entry.topic.lower()]
        matches.sort(key=lambda entry: entry.impact, reverse=True)
        return matches[0] if matches else None


__all__ = ["KnowledgeLake", "KnowledgeItem", "KnowledgeEntry"]
