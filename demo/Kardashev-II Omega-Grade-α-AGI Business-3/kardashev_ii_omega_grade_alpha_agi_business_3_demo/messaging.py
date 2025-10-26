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


Listener = Callable[[str, Dict[str, Any], str], Awaitable[None] | None]


class MessageBus:
    """Multi-topic async pub/sub message bus with observability hooks."""

    def __init__(self) -> None:
        self._topics: DefaultDict[str, Set[asyncio.Queue[Message]]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._listeners: Set[Listener] = set()

    def register_listener(self, listener: Listener) -> None:
        """Register a callback executed for every published message."""

        self._listeners.add(listener)

    def unregister_listener(self, listener: Listener) -> None:
        self._listeners.discard(listener)

    async def publish(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        message = Message(topic=topic, payload=payload, publisher=publisher)
        recipients: Set[asyncio.Queue[Message]] = set()
        async with self._lock:
            recipients |= set(self._topics.get(topic, set()))
            recipients |= set(self._topics.get("*", set()))
            for registered_topic, queues in self._topics.items():
                if registered_topic.endswith(":*") and topic.startswith(registered_topic[:-2]):
                    recipients |= set(queues)
            listeners = list(self._listeners)
        for queue in recipients:
            await queue.put(message)
        for listener in listeners:
            try:
                result = listener(message.topic, message.payload, message.publisher)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:  # pragma: no cover - defensive guard
                loop = asyncio.get_running_loop()
                loop.call_exception_handler(
                    {
                        "message": "MessageBus listener failed",
                        "exception": exc,
                        "context": {
                            "topic": message.topic,
                            "publisher": message.publisher,
                        },
                    }
                )

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
