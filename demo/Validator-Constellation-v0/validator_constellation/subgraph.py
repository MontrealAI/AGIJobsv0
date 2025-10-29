from __future__ import annotations

from typing import Dict, List, Optional

from .events import Event, EventBus


class SubgraphIndexer:
    def __init__(self, bus: EventBus) -> None:
        self._events: List[Event] = []
        bus.subscribe(self._events.append)

    def latest(self, event_type: str) -> Optional[Event]:
        for event in reversed(self._events):
            if event.type == event_type:
                return event
        return None

    def all_events(self) -> List[Event]:
        return list(self._events)

    def feed(self) -> List[Dict[str, object]]:
        return [
            {
                "type": event.type,
                "payload": event.payload,
                "block": event.block,
                "timestamp": event.timestamp,
            }
            for event in self._events
        ]

    def count(self) -> int:
        return len(self._events)
