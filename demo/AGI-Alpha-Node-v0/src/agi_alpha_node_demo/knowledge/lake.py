"""Persistent knowledge lake used by the planner and specialists."""
from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Iterable, List, Optional

LOGGER = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    quality_score REAL NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_insights_domain ON insights(domain);
CREATE INDEX IF NOT EXISTS idx_insights_job ON insights(job_id);
"""


class KnowledgeLake:
    """Store and retrieve cross-domain knowledge."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self._db_path)
        self._connection.execute("PRAGMA journal_mode=WAL;")
        self._connection.executescript(SCHEMA)
        LOGGER.debug("Knowledge Lake initialized at %s", self._db_path)

    def store(self, job_id: str, domain: str, quality_score: float, payload: dict) -> None:
        LOGGER.debug("Persisting insight job=%s domain=%s score=%s", job_id, domain, quality_score)
        with self._connection:
            self._connection.execute(
                "INSERT INTO insights(job_id, domain, quality_score, payload) VALUES (?, ?, ?, ?)",
                (job_id, domain, quality_score, json.dumps(payload, ensure_ascii=False)),
            )

    def fetch_recent(self, limit: int = 10) -> List[dict]:
        cursor = self._connection.execute(
            "SELECT job_id, domain, quality_score, payload, created_at FROM insights ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def search(self, keyword: str, limit: int = 10) -> List[dict]:
        pattern = f"%{keyword.lower()}%"
        cursor = self._connection.execute(
            "SELECT job_id, domain, quality_score, payload, created_at FROM insights WHERE lower(payload) LIKE ? ORDER BY created_at DESC LIMIT ?",
            (pattern, limit),
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def summarize_domain(self, domain: str, limit: int = 5) -> List[dict]:
        cursor = self._connection.execute(
            "SELECT job_id, domain, quality_score, payload, created_at FROM insights WHERE domain = ? ORDER BY quality_score DESC, created_at DESC LIMIT ?",
            (domain, limit),
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def close(self) -> None:
        self._connection.close()

    @staticmethod
    def _row_to_dict(row: Iterable) -> dict:
        job_id, domain, quality_score, payload, created_at = row
        data = json.loads(payload)
        data.update({"job_id": job_id, "domain": domain, "quality_score": quality_score, "created_at": created_at})
        return data


class KnowledgeSession:
    """Context manager for interacting with the knowledge lake."""

    def __init__(self, lake: KnowledgeLake) -> None:
        self._lake = lake

    def __enter__(self) -> KnowledgeLake:
        return self._lake

    def __exit__(self, exc_type, exc, tb) -> Optional[bool]:
        if exc:
            LOGGER.error("Knowledge session exited with error: %s", exc)
        return None
