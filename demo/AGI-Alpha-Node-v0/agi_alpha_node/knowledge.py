"""Knowledge Lake persistence using SQLite."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Optional
import json
import logging
import sqlite3
import time

LOGGER = logging.getLogger(__name__)


INIT_SQL = """
CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    topic TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at REAL NOT NULL
);
"""


@dataclass
class KnowledgeRecord:
    domain: str
    topic: str
    data: dict
    created_at: float


class KnowledgeLake:
    """Persistent shared knowledge base for the demo."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(INIT_SQL)
            conn.commit()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        try:
            yield conn
        finally:
            conn.close()

    def store(self, domain: str, topic: str, data: dict) -> None:
        LOGGER.debug(
            "Storing knowledge",
            extra={"domain": domain, "topic": topic, "keys": list(data.keys())},
        )
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO knowledge(domain, topic, data, created_at) VALUES (?, ?, ?, ?)",
                (domain, topic, json.dumps(data), time.time()),
            )
            conn.commit()

    def query(self, domain: Optional[str] = None, topic: Optional[str] = None) -> Iterable[KnowledgeRecord]:
        query = "SELECT domain, topic, data, created_at FROM knowledge"
        params = []
        clauses = []
        if domain:
            clauses.append("domain = ?")
            params.append(domain)
        if topic:
            clauses.append("topic = ?")
            params.append(topic)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC"

        with self._connect() as conn:
            for row in conn.execute(query, params):
                yield KnowledgeRecord(
                    domain=row[0],
                    topic=row[1],
                    data=json.loads(row[2]),
                    created_at=row[3],
                )


__all__ = ["KnowledgeLake", "KnowledgeRecord"]
