"""Prometheus metrics exporter."""

from __future__ import annotations

import logging
from prometheus_client import CollectorRegistry, Counter, Gauge, start_http_server

LOGGER = logging.getLogger("agi_alpha_node_demo.metrics")


class MetricsHub:
    def __init__(self, port: int, host: str = "0.0.0.0", registry: CollectorRegistry | None = None) -> None:
        self.port = port
        self.host = host
        self.registry = registry or CollectorRegistry()
        self.compliance_gauge = Gauge("agi_alpha_node_compliance_score", "Current compliance score", registry=self.registry)
        self.active_jobs = Gauge("agi_alpha_node_active_jobs", "Number of concurrent jobs", registry=self.registry)
        self.rewards_counter = Counter("agi_alpha_node_rewards_total", "Total rewards accrued", ["token"], registry=self.registry)
        self.specialist_success = Counter("agi_alpha_node_specialist_success_total", "Specialist success counter", ["name"], registry=self.registry)
        self._running = False
        LOGGER.debug("Metrics hub configured", extra={"port": port, "host": host})

    def start(self) -> None:
        if self._running:
            return
        start_http_server(self.port, addr=self.host, registry=self.registry)
        self._running = True
        LOGGER.info("Prometheus metrics exporter running", extra={"port": self.port, "host": self.host})

    def update_compliance(self, score: float) -> None:
        self.compliance_gauge.set(score)

    def set_active_jobs(self, count: int) -> None:
        self.active_jobs.set(count)

    def add_rewards(self, token: str, amount: float) -> None:
        self.rewards_counter.labels(token=token).inc(amount)

    def increment_specialist(self, name: str) -> None:
        self.specialist_success.labels(name=name).inc()
