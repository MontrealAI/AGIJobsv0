"""Knowledge lake implementation."""

from __future__ import annotations

import datetime as dt
import json
import logging
import sqlite3
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

import numpy as np

LOGGER = logging.getLogger("agi_alpha_node")


class KnowledgeLake:
    """Persistent store for cross-job intelligence."""

    def __init__(self, database_path: Path, embedding_dimension: int = 16):
        self.database_path = database_path
        self.embedding_dimension = embedding_dimension
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.database_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    content TEXT NOT NULL,
                    embedding BLOB NOT NULL
                )
                """
            )
        LOGGER.debug("Knowledge lake schema ensured", extra={"event": "knowledge_schema"})

    def add_entry(self, topic: str, content: str, embedding: Optional[Sequence[float]] = None) -> None:
        embedding_vec = np.array(embedding or self._embed(content), dtype=np.float32)
        with sqlite3.connect(self.database_path) as conn:
            conn.execute(
                "INSERT INTO knowledge(created_at, topic, content, embedding) VALUES (?, ?, ?, ?)",
                (dt.datetime.now(dt.timezone.utc).isoformat(), topic, content, embedding_vec.tobytes()),
            )
        LOGGER.info(
            "Knowledge entry stored",
            extra={"event": "knowledge_add", "data": {"topic": topic}},
        )

    def _embed(self, text: str) -> np.ndarray:
        # Simple deterministic embedding based on character frequencies.
        vec = np.zeros(self.embedding_dimension, dtype=np.float32)
        for idx, char in enumerate(text.encode("utf-8")):
            vec[idx % self.embedding_dimension] += char / 255.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def search(self, topic: str, limit: int = 5) -> List[str]:
        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.execute(
                "SELECT content FROM knowledge WHERE topic = ? ORDER BY id DESC LIMIT ?",
                (topic, limit),
            )
            rows = [row[0] for row in cursor.fetchall()]
        LOGGER.debug(
            "Knowledge search executed",
            extra={"event": "knowledge_search", "data": {"topic": topic, "rows": len(rows)}},
        )
        return rows

    def export(self) -> Iterable[dict]:
        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.execute(
                "SELECT created_at, topic, content FROM knowledge ORDER BY id DESC"
            )
            for row in cursor.fetchall():
                yield {
                    "created_at": row[0],
                    "topic": row[1],
                    "content": row[2],
                }

    def export_json(self) -> str:
        return json.dumps(list(self.export()), indent=2)


__all__ = ["KnowledgeLake"]
