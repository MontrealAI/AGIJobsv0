"""Asynchronous in-process publish/subscribe message bus for Omega V7."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List


@dataclass(slots=True)
class Message:
    """Structured payload propagated across the agent mesh."""

    topic: str
    payload: Dict[str, Any]
    sender: str
    timestamp: str


class Subscription:
    """Async iterator over a topic."""

    def __init__(self, queue: "asyncio.Queue[Message]", *, topic: str) -> None:
        self._queue = queue
        self.topic = topic

    def __aiter__(self) -> AsyncIterator[Message]:
        return self._consume()

    async def _consume(self) -> AsyncIterator[Message]:  # pragma: no cover - exercised in integration
        while True:
            message = await self._queue.get()
            try:
                yield message
            finally:
                self._queue.task_done()


class OmegaMessageBus:
    """Simple publish/subscribe broker used by the V7 orchestrator."""

    def __init__(self) -> None:
        self._topics: Dict[str, List[asyncio.Queue[Message]]] = defaultdict(list)
        self._listeners: List[Callable[[Message], Awaitable[None] | None]] = []
        self._lock = asyncio.Lock()

    async def publish(self, topic: str, payload: Dict[str, Any], sender: str) -> None:
        """Publish ``payload`` on ``topic`` with ``sender`` provenance."""

        message = Message(
            topic=topic,
            payload=dict(payload),
            sender=sender,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        async with self._lock:
            queues = list(self._topics.get(topic, ()))
        for queue in queues:
            await queue.put(message)
        await self._fanout(message)

    async def broadcast(self, pattern: str, payload: Dict[str, Any], sender: str) -> None:
        """Broadcast to all topics that share the prefix ``pattern``."""

        async with self._lock:
            topics = [name for name in self._topics if name.startswith(pattern)]
        for topic in topics:
            await self.publish(topic, payload, sender)

    async def subscribe(self, topic: str) -> Subscription:
        """Subscribe to ``topic`` returning a :class:`Subscription`."""

        queue: "asyncio.Queue[Message]" = asyncio.Queue(maxsize=1024)
        async with self._lock:
            self._topics[topic].append(queue)
        return Subscription(queue, topic=topic)

    def register_listener(self, listener: Callable[[Message], Awaitable[None] | None]) -> None:
        """Register a listener invoked for every published message."""

        self._listeners.append(listener)

    @property
    def topic_stats(self) -> Dict[str, int]:
        """Return the number of subscribers per topic."""

        return {topic: len(queues) for topic, queues in self._topics.items()}

    async def _fanout(self, message: Message) -> None:
        for listener in list(self._listeners):
            result = listener(message)
            if asyncio.iscoroutine(result):  # pragma: no cover - defensive guard
                await result


__all__ = ["Message", "OmegaMessageBus", "Subscription"]
