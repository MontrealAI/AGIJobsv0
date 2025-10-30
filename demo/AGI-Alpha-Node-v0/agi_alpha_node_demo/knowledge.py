"""Knowledge Lake implementation."""

from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

LOGGER = logging.getLogger("agi_alpha_node_demo.knowledge")


@dataclass
class Insight:
    topic: str
    content: str
    confidence: float


class KnowledgeLake:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialise()

    def _initialise(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS insights (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    content TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        LOGGER.debug("Knowledge lake initialised", extra={"path": str(self.database_path)})

    @contextmanager
    def _connection(self) -> Iterable[sqlite3.Connection]:
        conn = sqlite3.connect(self.database_path)
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

    def store(self, insight: Insight) -> None:
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO insights(topic, content, confidence) VALUES (?, ?, ?)",
                (insight.topic, insight.content, insight.confidence),
            )
        LOGGER.info("Insight stored", extra={"topic": insight.topic, "confidence": insight.confidence})

    def query(self, topic: str, limit: int = 5) -> List[Insight]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT topic, content, confidence FROM insights WHERE topic = ? ORDER BY confidence DESC LIMIT ?",
                (topic, limit),
            )
            rows = cursor.fetchall()
        insights = [Insight(topic=row[0], content=row[1], confidence=row[2]) for row in rows]
        LOGGER.debug("Retrieved %d insights for %s", len(insights), topic)
        return insights

    def purge(self) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM insights WHERE confidence < 0.1")
        LOGGER.warning("Low-confidence insights purged")
