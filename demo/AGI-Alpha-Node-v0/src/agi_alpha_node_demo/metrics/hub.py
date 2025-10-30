"""Metrics and event telemetry hub."""
from __future__ import annotations

import logging
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List

from prometheus_client import CollectorRegistry, Counter, Gauge

LOGGER = logging.getLogger(__name__)


@dataclass
class MetricSummary:
    label: str
    value: str
    description: str


@dataclass
class EventLog:
    max_entries: int = 200
    _events: Deque[str] = field(default_factory=lambda: deque(maxlen=200))
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def push(self, message: str) -> None:
        with self._lock:
            self._events.appendleft(message)
        LOGGER.debug("Event recorded: %s", message)

    def dump(self) -> str:
        with self._lock:
            return "\n".join(list(self._events))


class MetricsHub:
    """Encapsulates Prometheus metrics and summary utilities."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry(auto_describe=True)
        self.compliance = Gauge(
            "agi_alpha_node_compliance_score",
            "Composite compliance score across governance, staking, safety, and intelligence",
            registry=self.registry,
        )
        self.active_jobs = Gauge(
            "agi_alpha_node_active_jobs",
            "Number of jobs currently being executed",
            registry=self.registry,
        )
        self.rewards_accumulated = Gauge(
            "agi_alpha_node_rewards_total",
            "Total rewards accrued by the node",
            registry=self.registry,
        )
        self.completed_jobs = Counter(
            "agi_alpha_node_jobs_completed_total",
            "Total jobs completed by the node",
            registry=self.registry,
        )
        self.specialist_success = Counter(
            "agi_alpha_node_specialist_success_total",
            "Successful specialist executions",
            ["specialist"],
            registry=self.registry,
        )
        self.specialist_failures = Counter(
            "agi_alpha_node_specialist_failure_total",
            "Failed specialist executions",
            ["specialist"],
            registry=self.registry,
        )
        self.event_log = EventLog()

    def compliance_summary(self, score: float) -> None:
        self.compliance.set(score)
        LOGGER.info("Compliance score updated: %.2f", score)

    def set_active_jobs(self, count: int) -> None:
        self.active_jobs.set(count)

    def add_rewards(self, amount: float) -> None:
        self.rewards_accumulated.set(amount)

    def job_completed(self) -> None:
        self.completed_jobs.inc()

    def specialist_result(self, name: str, success: bool) -> None:
        if success:
            self.specialist_success.labels(name).inc()
        else:
            self.specialist_failures.labels(name).inc()

    def record_event(self, message: str) -> None:
        LOGGER.info(message)
        self.event_log.push(message)

    def summary(self) -> List[MetricSummary]:
        return [
            MetricSummary("Compliance", f"{self.compliance._value.get():.2f}", "Governance-grade compliance score"),
            MetricSummary("Rewards", f"{self.rewards_accumulated._value.get():.2f}", "Total rewards accrued"),
            MetricSummary("Active Jobs", str(int(self.active_jobs._value.get())), "Jobs currently running"),
            MetricSummary("Jobs Completed", str(int(self.completed_jobs._value.get())), "Total completed jobs"),
        ]

    def bootstrap(self) -> None:
        self.compliance.set(0.0)
        self.active_jobs.set(0)
        self.rewards_accumulated.set(0.0)
