"""Advanced async messaging fabric for the omega upgrade."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from fnmatch import fnmatch
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Tuple


@dataclass(slots=True)
class Message:
    topic: str
    payload: Dict[str, Any]
    publisher: str
    sequence: int


class MessageBus:
    """Async pub/sub bus with wildcard topics and telemetry hooks."""

    def __init__(self) -> None:
        self._topics: Dict[str, List[asyncio.Queue[Message]]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._sequence = 0
        self._monitors: List[Callable[[Message], Awaitable[None]]] = []

    async def publish(self, topic: str, payload: Dict[str, Any], publisher: str) -> Message:
        async with self._lock:
            self._sequence += 1
            message = Message(topic=topic, payload=payload, publisher=publisher, sequence=self._sequence)
            queues = list(self._topics.get(topic, []))
            for pattern, listeners in self._topics.items():
                if pattern in {topic, "*"}:
                    continue
                if any(ch in pattern for ch in "?*[]") and fnmatch(topic, pattern):
                    queues.extend(listeners)
            queues.extend(self._topics.get("*", []))
        for queue in queues:
            await queue.put(message)
        await self._notify_monitors(message)
        return message

    async def broadcast_control(self, payload: Dict[str, Any], publisher: str) -> Message:
        return await self.publish("control", payload, publisher)

    @asynccontextmanager
    async def subscribe(self, topic: str) -> AsyncIterator[Callable[[], Awaitable[Message]]]:
        queue: asyncio.Queue[Message] = asyncio.Queue()
        async with self._lock:
            self._topics[topic].append(queue)
        try:
            async def _next() -> Message:
                return await queue.get()

            yield _next
        finally:
            async with self._lock:
                listeners = self._topics.get(topic)
                if listeners and queue in listeners:
                    listeners.remove(queue)

    def register_monitor(self, callback: Callable[[Message], Awaitable[None]]) -> None:
        self._monitors.append(callback)

    async def _notify_monitors(self, message: Message) -> None:
        if not self._monitors:
            return
        await asyncio.gather(*(monitor(message) for monitor in self._monitors))

    async def drain(self) -> None:
        async with self._lock:
            self._topics.clear()
            self._monitors.clear()
            self._sequence = 0


class MessageRecorder:
    """Utility to persist message audit trails."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = asyncio.Lock()

    async def write(self, message: Message) -> None:
        record = {
            "sequence": message.sequence,
            "topic": message.topic,
            "publisher": message.publisher,
            "payload": message.payload,
        }
        async with self._lock:
            with open(self._path, "a", encoding="utf-8") as handle:
                handle.write(json_dumps(record))
                handle.write("\n")


def json_dumps(data: Dict[str, Any]) -> str:
    import json

    def _default(obj: Any) -> Any:
        if hasattr(obj, "__dict__"):
            return {key: value for key, value in obj.__dict__.items() if not key.startswith("_")}
        return str(obj)

    return json.dumps(data, sort_keys=True, default=_default)
