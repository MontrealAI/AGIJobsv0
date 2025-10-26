from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List


@dataclass
class Message:
    topic: str
    payload: Dict[str, Any]


class TopicQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[Message] = asyncio.Queue()
        self._subscribers: List[asyncio.Queue[Message]] = []

    def publish(self, message: Message) -> None:
        self._queue.put_nowait(message)
        for subscriber in list(self._subscribers):
            subscriber.put_nowait(message)

    def subscribe(self) -> asyncio.Queue[Message]:
        subscriber: asyncio.Queue[Message] = asyncio.Queue()
        self._subscribers.append(subscriber)
        return subscriber

    def unsubscribe(self, queue: asyncio.Queue[Message]) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)


class MessageBus:
    def __init__(self) -> None:
        self._topics: Dict[str, TopicQueue] = defaultdict(TopicQueue)

    def publish(self, topic: str, payload: Dict[str, Any]) -> None:
        message = Message(topic=topic, payload=payload)
        self._topics[topic].publish(message)
        # wildcard subscribers
        for key, queue in self._topics.items():
            if key.endswith("*") and topic.startswith(key[:-1]):
                queue.publish(message)

    def subscribe(self, topic: str) -> asyncio.Queue[Message]:
        return self._topics[topic].subscribe()

    async def listen(self, topic: str) -> AsyncIterator[Message]:
        queue = self.subscribe(topic)
        try:
            while True:
                message = await queue.get()
                yield message
        finally:
            self._topics[topic].unsubscribe(queue)

    def dump(self) -> Dict[str, int]:
        return {topic: len(queue._subscribers) for topic, queue in self._topics.items()}
