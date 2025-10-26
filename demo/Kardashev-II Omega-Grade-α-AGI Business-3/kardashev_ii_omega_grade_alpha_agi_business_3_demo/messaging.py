"""Asynchronous pub/sub bus for agent coordination."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable, DefaultDict, Dict, Set


@dataclass(slots=True)
class Message:
    topic: str
    payload: Dict[str, Any]
    publisher: str


class MessageBus:
    """Multi-topic async pub/sub message bus."""

    def __init__(self) -> None:
        self._topics: DefaultDict[str, Set[asyncio.Queue[Message]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def publish(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        message = Message(topic=topic, payload=payload, publisher=publisher)
        recipients: Set[asyncio.Queue[Message]] = set()
        async with self._lock:
            recipients |= set(self._topics.get(topic, set()))
            recipients |= set(self._topics.get("*", set()))
            for registered_topic, queues in self._topics.items():
                if registered_topic.endswith(":*") and topic.startswith(registered_topic[:-2]):
                    recipients |= set(queues)
        for queue in recipients:
            await queue.put(message)

    async def broadcast_control(self, payload: Dict[str, Any], publisher: str) -> None:
        await self.publish("control", payload, publisher)

    @asynccontextmanager
    async def subscribe(self, topic: str) -> AsyncIterator[Callable[[], Awaitable[Message]]]:
        queue: asyncio.Queue[Message] = asyncio.Queue()
        async with self._lock:
            self._topics[topic].add(queue)
        try:
            async def receiver() -> Message:
                message = await queue.get()
                queue.task_done()
                return message

            yield receiver
        finally:
            async with self._lock:
                self._topics[topic].discard(queue)
                if not self._topics[topic]:
                    del self._topics[topic]
