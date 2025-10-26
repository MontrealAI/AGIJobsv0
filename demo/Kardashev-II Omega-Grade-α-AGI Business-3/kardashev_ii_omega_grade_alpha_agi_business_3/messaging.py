"""Async publish/subscribe messaging for the agent mesh."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from hashlib import sha3_256
import logging
from typing import Any, Dict, List, MutableMapping, Tuple

from .logging_utils import log_json

logger = logging.getLogger(__name__)


@dataclass
class AuditEntry:
    topic: str
    digest: str


class MessageBus:
    """In-memory asynchronous message bus with audit trail."""

    def __init__(self) -> None:
        self._topics: MutableMapping[str, List[asyncio.Queue]] = {}
        self._audit_log: List[AuditEntry] = []
        self._lock = asyncio.Lock()

    async def subscribe(self, topic: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._topics.setdefault(topic, []).append(queue)
        log_json(logger, "bus_subscribe", topic=topic)
        return queue

    async def publish(self, topic: str, payload: Dict[str, Any]) -> None:
        digest = sha3_256(repr((topic, payload)).encode()).hexdigest()
        async with self._lock:
            queues = list(self._topics.get(topic, []))
        if not queues:
            return
        for queue in queues:
            await queue.put(payload)
        self._audit_log.append(AuditEntry(topic=topic, digest=digest))
        log_json(logger, "bus_publish", topic=topic, digest=digest)

    async def broadcast(self, topics: List[str], payload: Dict[str, Any]) -> None:
        for topic in topics:
            await self.publish(topic, payload)

    def audit_trail(self) -> List[Tuple[str, str]]:
        return [(entry.topic, entry.digest) for entry in self._audit_log]
