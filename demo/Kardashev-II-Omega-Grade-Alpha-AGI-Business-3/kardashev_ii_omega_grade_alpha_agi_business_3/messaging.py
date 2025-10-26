"""Async publish/subscribe messaging fabric."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Dict, List


@dataclass
class Message:
    topic: str
    payload: Dict[str, Any]
    publisher: str


class MessageBus:
    """Lightweight async message bus for in-process coordination."""

    def __init__(self) -> None:
        self._topics: Dict[str, List[asyncio.Queue[Message]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def publish(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        async with self._lock:
            queues = list(self._topics.get(topic, [])) + list(self._topics.get("*", []))
        if not queues:
            return
        message = Message(topic=topic, payload=payload, publisher=publisher)
        for queue in queues:
            await queue.put(message)

    @asynccontextmanager
    async def subscribe(self, topic: str) -> AsyncIterator[Callable[[], asyncio.Future[Message]]]:
        queue: asyncio.Queue[Message] = asyncio.Queue()
        async with self._lock:
            self._topics[topic].append(queue)
        try:
            async def _next() -> Message:
                return await queue.get()

            yield _next
        finally:
            async with self._lock:
                self._topics[topic].remove(queue)

    async def broadcast_control(self, payload: Dict[str, Any], publisher: str) -> None:
        await self.publish("control", payload, publisher)
