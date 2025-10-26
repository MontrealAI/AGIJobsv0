"""Audit trail utilities for the Kardashev-II Omega-Grade demo."""

from __future__ import annotations

import asyncio
import json
import weakref
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple

try:  # pragma: no cover - optional dependency
    from blake3 import blake3 as _blake3_hash  # type: ignore
except Exception:  # pragma: no cover - fallback when BLAKE3 wheel unavailable
    _blake3_hash = None

from hashlib import blake2b


def _encode_payload(payload: Dict[str, Any]) -> bytes:
    """Serialise a payload to canonical UTF-8 JSON bytes."""

    return json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode("utf-8")


def _compute_digest(payload: Dict[str, Any]) -> Tuple[str, str]:
    """Return a (digest_hex, algorithm) tuple for the payload."""

    data = _encode_payload(payload)
    if _blake3_hash is not None:
        return _blake3_hash(data).hexdigest(), "BLAKE3"
    # Deterministic fallback when the optional dependency is not installed.
    return blake2b(data, digest_size=32).hexdigest(), "BLAKE2b-256"


@dataclass(slots=True, weakref_slot=True)
class AuditTrail:
    """Append-only JSONL audit log capturing every bus message."""

    path: Path
    ensure_parent: bool = True
    flush: bool = True
    _handle: Any = field(init=False, repr=False)
    _lock: asyncio.Lock = field(init=False, repr=False)
    _closed: bool = field(init=False, repr=False, default=False)
    _finalizer: weakref.finalize = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if self.ensure_parent:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = self.path.open("a", encoding="utf-8")
        self._lock = asyncio.Lock()
        self._closed = False
        self._finalizer = weakref.finalize(self, self._handle.close)

    async def record_message(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        """Persist a digest of the message for tamper-evident auditing."""

        digest, algorithm = _compute_digest(payload)
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "topic": topic,
            "publisher": publisher,
            "digest": digest,
            "algorithm": algorithm,
            "payload_preview": json.dumps(payload, ensure_ascii=False, default=str)[:512],
        }
        async with self._lock:
            if self._closed:
                return
            self._handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            if self.flush:
                self._handle.flush()

    async def close(self) -> None:
        async with self._lock:
            if self._closed:
                return
            self._handle.close()
            self._finalizer.detach()
            self._closed = True
