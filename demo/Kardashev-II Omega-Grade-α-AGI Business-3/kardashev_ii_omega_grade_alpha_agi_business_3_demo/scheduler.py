"""Asynchronous scheduler for long-lived orchestrator events."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, Mapping, Optional


@dataclass
class ScheduledEvent:
    """Container describing a timed orchestrator action."""

    event_id: str
    event_type: str
    execute_at: datetime
    payload: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "execute_at": self.execute_at.isoformat(),
            "payload": dict(self.payload),
            "metadata": dict(self.metadata),
        }

    @classmethod
    def from_dict(cls, event_id: str, payload: Mapping[str, Any]) -> "ScheduledEvent":
        execute_at_raw = payload.get("execute_at")
        if isinstance(execute_at_raw, str):
            execute_at = datetime.fromisoformat(execute_at_raw)
        elif isinstance(execute_at_raw, datetime):  # pragma: no cover - defensive branch
            execute_at = execute_at_raw
        else:  # pragma: no cover - configuration should guarantee serialised strings
            raise ValueError("execute_at must be an ISO-8601 string")
        if execute_at.tzinfo is None:
            execute_at = execute_at.replace(tzinfo=timezone.utc)
        return cls(
            event_id=event_id,
            event_type=str(payload.get("event_type", "")),
            execute_at=execute_at,
            payload=dict(payload.get("payload", {})),
            metadata=dict(payload.get("metadata", {})),
        )


class EventScheduler:
    """Minimal persistent scheduler that survives restarts via checkpoints."""

    def __init__(self, dispatcher: Callable[[ScheduledEvent], Awaitable[None]]) -> None:
        self._dispatcher = dispatcher
        self._events: Dict[str, ScheduledEvent] = {}
        self._tasks: Dict[str, asyncio.Task[None]] = {}
        self._preserve_events = False

    def _create_task(self, event: ScheduledEvent) -> asyncio.Task[None]:
        return asyncio.create_task(self._run_event(event), name=f"event:{event.event_id}")

    async def _run_event(self, event: ScheduledEvent) -> None:
        delay = max(0.0, (event.execute_at - datetime.now(timezone.utc)).total_seconds())
        try:
            await asyncio.sleep(delay)
            if event.event_id not in self._events:
                return
            await self._dispatcher(event)
        except asyncio.CancelledError:  # pragma: no cover - cooperative cancellation
            return
        finally:
            if not self._preserve_events:
                self._events.pop(event.event_id, None)
            self._tasks.pop(event.event_id, None)

    def to_serializable(self) -> Dict[str, Dict[str, Any]]:
        return {event_id: event.to_dict() for event_id, event in self._events.items()}

    async def schedule(
        self,
        event_type: str,
        execute_at: datetime,
        payload: Optional[Dict[str, Any]] = None,
        *,
        event_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ScheduledEvent:
        if execute_at.tzinfo is None:
            execute_at = execute_at.replace(tzinfo=timezone.utc)
        event = ScheduledEvent(
            event_id=event_id or uuid.uuid4().hex,
            event_type=event_type,
            execute_at=execute_at,
            payload=dict(payload or {}),
            metadata=dict(metadata or {}),
        )
        self._events[event.event_id] = event
        self._tasks[event.event_id] = self._create_task(event)
        return event

    async def cancel(self, event_id: Optional[str]) -> bool:
        if not event_id:
            return False
        event = self._events.pop(event_id, None)
        task = self._tasks.pop(event_id, None)
        if task:
            task.cancel()
        return event is not None

    async def rehydrate(self, payload: Mapping[str, Mapping[str, Any]]) -> None:
        for event_id, data in payload.items():
            event = ScheduledEvent.from_dict(event_id, data)
            self._events[event_id] = event
            self._tasks[event_id] = self._create_task(event)

    async def shutdown(self) -> None:
        snapshot = list(self._events.values())
        self._preserve_events = True
        try:
            for task in list(self._tasks.values()):
                task.cancel()
            if self._tasks:
                await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        finally:
            self._tasks.clear()
            self._preserve_events = False
            # restore event objects to ensure references remain intact post-shutdown
            self._events = {event.event_id: event for event in snapshot}

    def pending_events(self) -> Iterable[ScheduledEvent]:
        return list(self._events.values())

    def peek_next(self) -> Optional[ScheduledEvent]:
        if not self._events:
            return None
        return min(self._events.values(), key=lambda evt: evt.execute_at)

    def has_event(self, event_id: Optional[str]) -> bool:
        return bool(event_id and event_id in self._events)

