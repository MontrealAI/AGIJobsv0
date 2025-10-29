"""Knowledge Lake implementation."""
from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator, List, Tuple

_LOGGER = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL
);
"""


@dataclass
class KnowledgeEntry:
    topic: str
    content: str
    tags: Tuple[str, ...]
    confidence: float
    created_at: datetime


class KnowledgeLake:
    """Simple SQLite-backed long-term memory."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as conn:
            conn.executescript(SCHEMA)
        _LOGGER.debug("KnowledgeLake initialized", extra={"path": str(self._db_path)})

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

    def record(self, topic: str, content: str, tags: Iterable[str], confidence: float) -> KnowledgeEntry:
        now = datetime.now(timezone.utc)
        tags_str = ",".join(sorted(tags))
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO knowledge (topic, content, tags, confidence, created_at) VALUES (?, ?, ?, ?, ?)",
                (topic, content, tags_str, float(confidence), now.isoformat()),
            )
        entry = KnowledgeEntry(topic, content, tuple(sorted(tags)), float(confidence), now)
        _LOGGER.info("Knowledge recorded", extra={"topic": topic, "tags": tags_str})
        return entry

    def query(self, topic: str, limit: int = 5) -> List[KnowledgeEntry]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT topic, content, tags, confidence, created_at FROM knowledge WHERE topic = ? ORDER BY created_at DESC LIMIT ?",
                (topic, limit),
            ).fetchall()
        entries = [
            KnowledgeEntry(
                topic=row[0],
                content=row[1],
                tags=tuple(filter(None, row[2].split(","))),
                confidence=float(row[3]),
                created_at=datetime.fromisoformat(row[4]),
            )
            for row in rows
        ]
        return entries

    def latest(self, limit: int = 10) -> List[KnowledgeEntry]:
        with self._connection() as conn:
            rows = conn.execute(
                "SELECT topic, content, tags, confidence, created_at FROM knowledge ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        entries = [
            KnowledgeEntry(
                topic=row[0],
                content=row[1],
                tags=tuple(filter(None, row[2].split(","))),
                confidence=float(row[3]),
                created_at=datetime.fromisoformat(row[4]),
            )
            for row in rows
        ]
        return entries
