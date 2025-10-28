"""Event bus utilities powering pseudo on-chain/subgraph telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Tuple


@dataclass(slots=True)
class Event:
    """Represents a structured event emitted by the simulation."""

    type: str
    payload: Dict[str, object]
    timestamp: datetime


class EventBus:
    """Simple publish/subscribe event bus with replay support."""

    def __init__(self) -> None:
        self._events: List[Event] = []
        self._subscribers: List[Callable[[Event], None]] = []

    def publish(self, event_type: str, payload: Dict[str, object]) -> Event:
        event = Event(type=event_type, payload=payload, timestamp=datetime.now(timezone.utc))
        self._events.append(event)
        for subscriber in list(self._subscribers):
            subscriber(event)
        return event

    def subscribe(self, handler: Callable[[Event], None]) -> None:
        if handler not in self._subscribers:
            self._subscribers.append(handler)

    def unsubscribe(self, handler: Callable[[Event], None]) -> None:
        if handler in self._subscribers:
            self._subscribers.remove(handler)

    @property
    def events(self) -> Tuple[Event, ...]:
        return tuple(self._events)

    def find(self, event_type: str) -> Iterable[Event]:
        return (event for event in self._events if event.type == event_type)
