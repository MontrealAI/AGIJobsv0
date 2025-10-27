"""Async agent-to-agent message bus with audit trail."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Awaitable, Callable, Dict, List

MessageHandler = Callable[[str, Dict[str, object], str], Awaitable[None]]


class AsyncMessageBus:
    """Lightweight publish/subscribe message bus."""

    def __init__(self, history_path: Path) -> None:
        self._topics: Dict[str, List[MessageHandler]] = {}
        self._history_path = history_path
        self._history_lock = asyncio.Lock()

    def register_listener(self, topic: str, handler: MessageHandler) -> None:
        self._topics.setdefault(topic, []).append(handler)

    def unregister_listener(self, topic: str, handler: MessageHandler) -> None:
        handlers = self._topics.get(topic)
        if not handlers:
            return
        if handler in handlers:
            handlers.remove(handler)
        if not handlers:
            del self._topics[topic]

    async def publish(self, topic: str, payload: Dict[str, object], publisher: str) -> None:
        await self._append_history(topic, payload, publisher)
        handlers = [
            handler
            for registered_topic, handler_list in self._topics.items()
            for handler in handler_list
            if self._topic_matches(registered_topic, topic)
        ]
        if not handlers:
            return
        await asyncio.gather(*(handler(topic, payload, publisher) for handler in handlers))

    async def _append_history(self, topic: str, payload: Dict[str, object], publisher: str) -> None:
        entry = {
            "topic": topic,
            "payload": payload,
            "publisher": publisher,
            "loop_time": asyncio.get_event_loop().time(),
        }
        async with self._history_lock:
            self._history_path.parent.mkdir(parents=True, exist_ok=True)
            with self._history_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry) + "\n")

    @staticmethod
    def _topic_matches(registered: str, incoming: str) -> bool:
        if registered == incoming:
            return True
        if registered.endswith("*"):
            prefix = registered[:-1]
            return incoming.startswith(prefix)
        return False


__all__ = ["AsyncMessageBus", "MessageHandler"]
