"""Persistent knowledge lake implementation."""
from __future__ import annotations

import json
import logging
import math
import pathlib
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Tuple

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class KnowledgeItem:
    key: str
    embedding: List[float]
    payload: Dict[str, str]


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


__all__ = ["KnowledgeLake", "KnowledgeItem"]
