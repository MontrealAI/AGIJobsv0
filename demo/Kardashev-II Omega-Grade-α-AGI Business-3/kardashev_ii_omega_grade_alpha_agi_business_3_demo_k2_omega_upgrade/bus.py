"""Async publish/subscribe message bus for agent-to-agent communication."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, AsyncIterator, Dict, List


class MessageBus:
    """Simple in-memory topic based pub/sub bus."""

    def __init__(self) -> None:
        self._topics: Dict[str, List[asyncio.Queue]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def subscribe(self, topic: str) -> AsyncIterator[Dict[str, Any]]:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._topics[topic].append(queue)
        try:
            while True:
                payload = await queue.get()
                yield payload
        finally:
            async with self._lock:
                self._topics[topic].remove(queue)

    async def publish(self, topic: str, payload: Dict[str, Any]) -> None:
        async with self._lock:
            queues = list(self._topics.get(topic, []))
        for queue in queues:
            await queue.put(payload)

    async def broadcast(self, payload: Dict[str, Any], *, topics: List[str]) -> None:
        for topic in topics:
            await self.publish(topic, payload)

