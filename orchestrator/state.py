"""Persistence helpers for orchestration run state."""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional

from pydantic import ValidationError

from .models import StatusOut

_DEFAULT_DIR = Path(os.environ.get("ORCHESTRATOR_STATE_DIR", "storage/orchestrator/runs"))


class RunStateError(RuntimeError):
    """Raised when a persistence backend cannot be initialised."""


class RunStateStore:
    """Abstract interface for run state persistence backends."""

    def save(self, status: StatusOut) -> None:
        raise NotImplementedError

    def load(self, run_id: str) -> Optional[StatusOut]:
        raise NotImplementedError

    def delete(self, run_id: str) -> None:
        raise NotImplementedError

    def list_ids(self) -> Iterable[str]:
        raise NotImplementedError


class FileRunStateStore(RunStateStore):
    """Store run state on disk as JSON payloads.

    The goal is to provide a deterministic persistence layer that works out of the
    box for unit tests and local development.  Production deployments can swap the
    implementation via :func:`get_store`.
    """

    def __init__(self, root: Path | None = None) -> None:
        self._root = (root or _DEFAULT_DIR).resolve()
        self._lock = threading.Lock()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, run_id: str) -> Path:
        return self._root / f"{run_id}.json"

    def save(self, status: StatusOut) -> None:
        payload = status.model_dump(mode="json")
        with self._lock:
            tmp_path = self._path(status.run.id).with_suffix(".json.tmp")
            with tmp_path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, sort_keys=True)
            tmp_path.replace(self._path(status.run.id))

    def load(self, run_id: str) -> Optional[StatusOut]:
        path = self._path(run_id)
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            return StatusOut.model_validate(data)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:  # pragma: no cover - corrupted file
            raise RunStateError(f"Failed to load persisted run {run_id}: {exc}") from exc

    def delete(self, run_id: str) -> None:
        path = self._path(run_id)
        with self._lock:
            if path.exists():
                path.unlink()

    def list_ids(self) -> Iterable[str]:
        if not self._root.exists():
            return []
        return [path.stem for path in self._root.glob("*.json")]


@dataclass
class _RedisFacade:
    client: "redis.Redis[bytes]"

    @classmethod
    def create(cls, url: str) -> "_RedisFacade":
        try:
            import redis  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise RunStateError("redis package is required for RedisRunStateStore") from exc
        client: "redis.Redis[bytes]" = redis.from_url(url)
        return cls(client)


class RedisRunStateStore(RunStateStore):
    """Redis-backed state store for horizontal scaling deployments."""

    def __init__(self, url: str) -> None:
        self._facade = _RedisFacade.create(url)

    def _key(self, run_id: str) -> str:
        return f"orchestrator:run:{run_id}"

    def save(self, status: StatusOut) -> None:
        payload = json.dumps(status.model_dump(mode="json"), ensure_ascii=False)
        self._facade.client.set(self._key(status.run.id), payload)

    def load(self, run_id: str) -> Optional[StatusOut]:
        data = self._facade.client.get(self._key(run_id))
        if not data:
            return None
        payload = json.loads(data.decode("utf-8"))
        return StatusOut.model_validate(payload)

    def delete(self, run_id: str) -> None:
        self._facade.client.delete(self._key(run_id))

    def list_ids(self) -> Iterable[str]:
        pattern = self._key("*")
        keys = self._facade.client.keys(pattern)
        prefix = self._key("")
        return [key.decode("utf-8")[len(prefix):] for key in keys]


class PostgresRunStateStore(RunStateStore):
    """PostgreSQL-backed persistence using a simple JSONB table."""

    def __init__(self, dsn: str) -> None:
        try:
            import psycopg  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - optional dependency
            raise RunStateError("psycopg package is required for PostgresRunStateStore") from exc
        self._dsn = dsn
        self._pool = psycopg.Connection.connect(dsn, autocommit=True)
        with self._pool.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS orchestrator_runs (
                    run_id TEXT PRIMARY KEY,
                    payload JSONB NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )

    def save(self, status: StatusOut) -> None:
        payload = json.dumps(status.model_dump(mode="json"), ensure_ascii=False)
        with self._pool.cursor() as cur:
            cur.execute(
                """
                INSERT INTO orchestrator_runs (run_id, payload)
                VALUES (%s, %s)
                ON CONFLICT (run_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
                """,
                (status.run.id, payload),
            )

    def load(self, run_id: str) -> Optional[StatusOut]:
        with self._pool.cursor() as cur:
            cur.execute("SELECT payload FROM orchestrator_runs WHERE run_id = %s", (run_id,))
            row = cur.fetchone()
        if not row:
            return None
        payload = row[0]
        return StatusOut.model_validate(payload)

    def delete(self, run_id: str) -> None:
        with self._pool.cursor() as cur:
            cur.execute("DELETE FROM orchestrator_runs WHERE run_id = %s", (run_id,))

    def list_ids(self) -> Iterable[str]:
        with self._pool.cursor() as cur:
            cur.execute("SELECT run_id FROM orchestrator_runs")
            return [row[0] for row in cur.fetchall()]


_STORE_SINGLETON: Dict[str, RunStateStore] = {}


def get_store() -> RunStateStore:
    """Return the configured persistence backend.

    The backend is chosen using ``ORCHESTRATOR_STATE_BACKEND`` which accepts
    ``file`` (default), ``redis`` or ``postgres``.  The helper caches the
    instantiated store since the runner calls it frequently.
    """

    backend = os.environ.get("ORCHESTRATOR_STATE_BACKEND", "file").lower()
    if backend in _STORE_SINGLETON:
        return _STORE_SINGLETON[backend]

    if backend == "redis":
        url = os.environ.get("ORCHESTRATOR_STATE_URL", "redis://localhost:6379/0")
        store = RedisRunStateStore(url)
    elif backend in {"postgres", "postgresql", "psql"}:
        dsn = os.environ.get("ORCHESTRATOR_STATE_URL", "postgresql://localhost/orchestrator")
        store = PostgresRunStateStore(dsn)
    else:
        store = FileRunStateStore()
    _STORE_SINGLETON[backend] = store
    return store
