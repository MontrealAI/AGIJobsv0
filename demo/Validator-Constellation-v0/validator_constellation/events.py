from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional


@dataclass
class Event:
    type: str
    payload: Dict[str, Any]
    block: int
    timestamp: float


class EventBus:
    """Simple event bus capturing timeline ordered emissions."""

    def __init__(self) -> None:
        self._events: List[Event] = []
        self._subscribers: List[Callable[[Event], None]] = []
        self._block: int = 0

    @property
    def current_block(self) -> int:
        return self._block

    def advance_block(self, blocks: int = 1) -> None:
        self._block += max(1, blocks)

    def emit(self, event_type: str, **payload: Any) -> Event:
        event = Event(event_type, payload, self._block, time.time())
        self._events.append(event)
        for subscriber in list(self._subscribers):
            subscriber(event)
        return event

    def subscribe(self, callback: Callable[[Event], None]) -> None:
        self._subscribers.append(callback)

    def events(self) -> Iterable[Event]:
        return iter(self._events)

    def find(self, event_type: str) -> Iterable[Event]:
        for event in self._events:
            if event.type == event_type:
                yield event

    def latest(self, event_type: str) -> Optional[Event]:
        for event in reversed(self._events):
            if event.type == event_type:
                return event
        return None
