"""Sentinel anomaly detection and domain pause controls."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Optional

from .events import EventBus


@dataclass(slots=True)
class AgentAction:
    agent: str
    domain: str
    spend: float
    call: str
    metadata: Dict[str, object]


@dataclass(slots=True)
class SentinelAlert:
    domain: str
    reason: str
    action: AgentAction
    timestamp: datetime


@dataclass(slots=True)
class SentinelRule:
    name: str
    description: str
    predicate: Callable[[AgentAction], bool]


class DomainPauseController:
    """Manages emergency domain pauses triggered by Sentinel alerts."""

    def __init__(self, event_bus: EventBus) -> None:
        self._event_bus = event_bus
        self._paused: Dict[str, datetime] = {}

    def pause(self, domain: str, reason: str) -> None:
        if domain not in self._paused:
            timestamp = datetime.now(timezone.utc)
            self._paused[domain] = timestamp
            self._event_bus.publish(
                "DomainPaused", {"domain": domain, "reason": reason, "timestamp": timestamp.isoformat()}
            )

    def resume(self, domain: str, operator: str) -> None:
        if domain in self._paused:
            timestamp = self._paused.pop(domain)
            self._event_bus.publish(
                "DomainResumed",
                {"domain": domain, "operator": operator, "pausedAt": timestamp.isoformat()},
            )

    def is_paused(self, domain: str) -> bool:
        return domain in self._paused

    @property
    def paused_domains(self) -> Dict[str, datetime]:
        return dict(self._paused)


class SentinelMonitor:
    """Runs deterministic anomaly detection rules across agent actions."""

    def __init__(self, rules: Iterable[SentinelRule], pause_controller: DomainPauseController, event_bus: EventBus) -> None:
        self.rules = list(rules)
        self.pause_controller = pause_controller
        self.event_bus = event_bus
        self.alerts: List[SentinelAlert] = []

    def evaluate(self, action: AgentAction) -> Optional[SentinelAlert]:
        if self.pause_controller.is_paused(action.domain):
            return None
        for rule in self.rules:
            if rule.predicate(action):
                alert = SentinelAlert(
                    domain=action.domain,
                    reason=rule.description,
                    action=action,
                    timestamp=datetime.now(timezone.utc),
                )
                self.alerts.append(alert)
                self.pause_controller.pause(action.domain, reason=rule.description)
                self.event_bus.publish(
                    "SentinelAlert",
                    {
                        "domain": action.domain,
                        "reason": rule.description,
                        "agent": action.agent,
                        "call": action.call,
                        "spend": action.spend,
                        "metadata": action.metadata,
                    },
                )
                return alert
        return None

    def resume_domain(self, domain: str, operator: str) -> None:
        self.pause_controller.resume(domain, operator)

    def add_rule(self, rule: SentinelRule) -> None:
        self.rules.append(rule)
