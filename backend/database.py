"""Database utilities shared by orchestrator and API layers."""

from __future__ import annotations

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, Sequence

try:  # Optional dependency for production Postgres deployments.
    import psycopg  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - psycopg is optional for tests
    psycopg = None  # type: ignore


class DatabaseError(RuntimeError):
    """Raised when the database backend cannot be initialised."""


class Database:
    """Lightweight connection manager with transactional helpers."""

    def __init__(self, url: str | None = None) -> None:
        self._url = url or os.environ.get("HGM_DATABASE_URL", "sqlite:///storage/hgm.db")
        self._driver, self._dsn = self._parse_url(self._url)
        self._lock = threading.RLock()
        self._conn = self._connect()
        self._closed = False

    @staticmethod
    def _parse_url(url: str) -> tuple[str, str]:
        url = url.strip()
        if not url:
            raise DatabaseError("Empty database URL")
        if url.startswith("sqlite://"):
            dsn = url[len("sqlite://"):]
            if dsn.startswith("/"):
                # Handle sqlite:////absolute/path.db -> //absolute/path.db
                while dsn.startswith("//"):
                    dsn = dsn[1:]
                if dsn.startswith("/"):
                    # Absolute path
                    return "sqlite", dsn
                return "sqlite", dsn
            if not dsn:
                return "sqlite", ":memory:"
            return "sqlite", dsn
        if url.startswith("sqlite:") and url.count(":") == 1:
            return "sqlite", url[len("sqlite:"):]
        if url.startswith("postgresql://") or url.startswith("postgres://"):
            if psycopg is None:
                raise DatabaseError("psycopg is required for PostgreSQL connections")
            return "postgres", url
        if ":" not in url and url.endswith(".db"):
            return "sqlite", url
        raise DatabaseError(f"Unsupported database URL: {url}")

    def _connect(self):  # type: ignore[override]
        if self._driver == "sqlite":
            path = self._dsn
            if path in {":memory:", "memory"}:
                conn = sqlite3.connect(":memory:", check_same_thread=False)
            else:
                db_path = Path(path)
                if not db_path.is_absolute():
                    db_path = Path.cwd() / db_path
                db_path.parent.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(str(db_path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            return conn
        if self._driver == "postgres":
            assert psycopg is not None  # for type-checkers
            return psycopg.connect(self._dsn)  # type: ignore[no-any-return]
        raise DatabaseError(f"Unsupported driver: {self._driver}")

    @property
    def driver(self) -> str:
        return self._driver

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._conn.close()
            self._closed = True

    @contextmanager
    def transaction(self):  # type: ignore[override]
        if self._closed:
            raise DatabaseError("Database connection already closed")
        with self._lock:
            cursor = self._conn.cursor()
            try:
                yield cursor
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
            finally:
                cursor.close()

    def run_migrations(self, migrations: Sequence["Migration"], *, table: str = "hgm_schema_migrations") -> None:
        """Apply migrations sequentially, tracking applied versions."""

        self._ensure_migration_table(table)
        for migration in migrations:
            if self._is_applied(migration.version, table):
                continue
            with self.transaction() as cur:
                migration.upgrade(cur, self._driver)
                placeholder = self.placeholder()
                cur.execute(
                    f"INSERT INTO {table} (version, applied_at) VALUES ({placeholder}, {placeholder})",
                    (migration.version, self._timestamp()),
                )

    def _ensure_migration_table(self, table: str) -> None:
        with self.transaction() as cur:
            if self._driver == "postgres":
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        version TEXT PRIMARY KEY,
                        applied_at DOUBLE PRECISION NOT NULL
                    )
                    """
                )
            else:
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        version TEXT PRIMARY KEY,
                        applied_at REAL NOT NULL
                    )
                    """
                )

    def _is_applied(self, version: str, table: str) -> bool:
        with self.transaction() as cur:
            placeholder = self.placeholder()
            cur.execute(f"SELECT 1 FROM {table} WHERE version = {placeholder}", (version,))
            return cur.fetchone() is not None

    @staticmethod
    def _timestamp() -> float:
        return time.time()

    def placeholder(self) -> str:
        return "%s" if self._driver == "postgres" else "?"


class Migration:
    """Protocol implemented by concrete migration definitions."""

    version: str

    def upgrade(self, cursor, driver: str) -> None:  # pragma: no cover - interface
        raise NotImplementedError


_DATABASE_SINGLETON: Optional[Database] = None
_DATABASE_LOCK = threading.Lock()


def get_database(url: str | None = None) -> Database:
    """Return a process-wide database handle."""

    global _DATABASE_SINGLETON
    with _DATABASE_LOCK:
        if _DATABASE_SINGLETON is not None:
            return _DATABASE_SINGLETON
        db = Database(url)
        from backend.migrations import MIGRATIONS

        db.run_migrations(MIGRATIONS)
        _DATABASE_SINGLETON = db
        return db


def set_database(database: Database | None) -> None:
    """Override the global database singleton (primarily for tests)."""

    global _DATABASE_SINGLETON
    with _DATABASE_LOCK:
        if _DATABASE_SINGLETON is not None and database is not _DATABASE_SINGLETON:
            _DATABASE_SINGLETON.close()
        _DATABASE_SINGLETON = database


__all__ = ["Database", "DatabaseError", "Migration", "get_database", "set_database"]
