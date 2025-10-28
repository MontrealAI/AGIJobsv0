"""Mock subgraph indexer used for the demo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from .events import Event, EventBus


@dataclass(slots=True)
class IndexedEvent:
    type: str
    payload: Dict[str, object]
    timestamp: str


@dataclass(slots=True)
class SubgraphIndexer:
    event_bus: EventBus
    events: List[IndexedEvent] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.event_bus.subscribe(self._handle_event)

    def _handle_event(self, event: Event) -> None:
        indexed_types = {
            "ValidatorSlashed",
            "DomainPaused",
            "DomainResumed",
            "SentinelAlert",
            "RoundFinalized",
            "PhaseTransition",
            "ConfigUpdated",
        }
        if event.type in indexed_types:
            self.events.append(
                IndexedEvent(
                    type=event.type,
                    payload=dict(event.payload),
                    timestamp=event.timestamp.isoformat(),
                )
            )

    def latest(self, event_type: str) -> IndexedEvent | None:
        for event in reversed(self.events):
            if event.type == event_type:
                return event
        return None

    def all(self, event_type: str) -> List[IndexedEvent]:
        return [event for event in self.events if event.type == event_type]
