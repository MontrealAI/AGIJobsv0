"""Persistence layer for the HGM demo using SQLite."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterable, Optional

from .engine import EngineMetrics
from .simulation import ExpansionOutcome, EvaluationOutcome


class Persistence:
    """Persists lineage, outcomes and run metrics."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._connection = sqlite3.connect(database_path)
        self._run_id: Optional[int] = None
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        cursor = self._connection.cursor()
        cursor.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP,
                expansions INTEGER DEFAULT 0,
                evaluations INTEGER DEFAULT 0,
                successes INTEGER DEFAULT 0,
                failures INTEGER DEFAULT 0,
                cost REAL DEFAULT 0.0,
                gmv REAL DEFAULT 0.0,
                roi REAL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS agents (
                agent_id TEXT PRIMARY KEY,
                parent_id TEXT,
                generation INTEGER,
                quality_delta REAL,
                FOREIGN KEY(parent_id) REFERENCES agents(agent_id)
            );

            CREATE TABLE IF NOT EXISTS expansions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id TEXT,
                child_id TEXT,
                quality_delta REAL,
                description TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT,
                success INTEGER,
                reward REAL,
                cost REAL,
                roi REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        self._connection.commit()

    def start_run(self) -> None:
        cursor = self._connection.cursor()
        cursor.execute("INSERT INTO runs DEFAULT VALUES")
        self._run_id = cursor.lastrowid
        self._connection.commit()

    def finish_run(self, metrics: EngineMetrics) -> None:
        if self._run_id is None:
            raise RuntimeError("finish_run called before start_run")
        cursor = self._connection.cursor()
        cursor.execute(
            """
            UPDATE runs
            SET finished_at = CURRENT_TIMESTAMP,
                expansions = ?,
                evaluations = ?,
                successes = ?,
                failures = ?,
                cost = ?,
                gmv = ?,
                roi = ?
            WHERE id = ?
            """,
            (
                metrics.expansions,
                metrics.evaluations,
                metrics.successes,
                metrics.failures,
                metrics.cost,
                metrics.gmv,
                metrics.roi,
                self._run_id,
            ),
        )
        self._connection.commit()

    def record_expansion(self, parent_id: str, child_id: str, generation: int, outcome: ExpansionOutcome) -> None:
        cursor = self._connection.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO agents(agent_id, parent_id, generation, quality_delta) VALUES(?, ?, ?, ?)",
            (child_id, parent_id, generation, outcome.quality_delta),
        )
        cursor.execute(
            "INSERT INTO expansions(parent_id, child_id, quality_delta, description, metadata) VALUES(?, ?, ?, ?, ?)",
            (parent_id, child_id, outcome.quality_delta, outcome.description, json.dumps(outcome.metadata)),
        )
        self._connection.commit()

    def record_evaluation(self, agent_id: str, outcome: EvaluationOutcome) -> None:
        cursor = self._connection.cursor()
        cursor.execute(
            "INSERT INTO evaluations(agent_id, success, reward, cost, roi) VALUES(?, ?, ?, ?, ?)",
            (agent_id, int(outcome.success), outcome.reward, outcome.cost, outcome.roi),
        )
        self._connection.commit()

    def list_agents(self) -> Iterable[tuple[str, Optional[str], int, float]]:
        cursor = self._connection.cursor()
        cursor.execute("SELECT agent_id, parent_id, generation, quality_delta FROM agents ORDER BY agent_id")
        return cursor.fetchall()

    def close(self) -> None:
        self._connection.close()

