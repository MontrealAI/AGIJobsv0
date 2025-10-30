from __future__ import annotations

import dataclasses
import logging
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class KnowledgeRecord:
    id: int
    topic: str
    content: str
    created_at: float


class KnowledgeLake:
    """SQLite-backed long-term memory store."""

    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self._lock = threading.RLock()
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def add_entry(self, topic: str, content: str) -> KnowledgeRecord:
        timestamp = time.time()
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO knowledge(topic, content, created_at) VALUES (?, ?, ?)",
                (topic, content, timestamp),
            )
            conn.commit()
            record = KnowledgeRecord(id=cur.lastrowid, topic=topic, content=content, created_at=timestamp)
            logger.debug("Knowledge stored", extra={"context": dataclasses.asdict(record)})
            return record

    def query(self, topic: str, limit: int = 5) -> List[KnowledgeRecord]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, topic, content, created_at FROM knowledge WHERE topic = ? ORDER BY created_at DESC LIMIT ?",
                (topic, limit),
            ).fetchall()
            return [KnowledgeRecord(**dict(row)) for row in rows]

    def topics(self) -> Sequence[str]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT DISTINCT topic FROM knowledge ORDER BY topic").fetchall()
            return [row[0] for row in rows]

    def purge_older_than(self, ttl_seconds: float) -> int:
        cutoff = time.time() - ttl_seconds
        with self._lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM knowledge WHERE created_at < ?", (cutoff,))
            conn.commit()
            deleted = cur.rowcount
            if deleted:
                logger.info("Purged stale knowledge", extra={"context": {"deleted": deleted}})
            return deleted


__all__ = ["KnowledgeLake", "KnowledgeRecord"]
