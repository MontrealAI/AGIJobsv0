"""Prometheus metrics exporter."""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from typing import Dict, Iterable

from prometheus_client import CollectorRegistry, Gauge, start_http_server

LOGGER = logging.getLogger("agi_alpha_node")


class MetricsExporter:
    def __init__(self, port: int):
        self.port = port
        self.registry = CollectorRegistry()
        self._gauges: Dict[str, Gauge] = {}
        self._server_thread: threading.Thread | None = None

    def ensure_server(self) -> None:
        if self._server_thread and self._server_thread.is_alive():
            return
        start_http_server(self.port, registry=self.registry)
        self._server_thread = threading.current_thread()
        LOGGER.info("Prometheus exporter listening", extra={"event": "metrics_start", "data": {"port": self.port}})

    def gauge(self, name: str, documentation: str, labels: Iterable[str] | None = None) -> Gauge:
        if name not in self._gauges:
            self._gauges[name] = Gauge(name, documentation, labelnames=tuple(labels or ()), registry=self.registry)
        return self._gauges[name]

    def update_compliance(self, scores: Dict[str, float]) -> None:
        gauge = self.gauge("agi_alpha_node_compliance_score", "Compliance score by dimension", labels=["dimension"])
        for dimension, score in scores.items():
            gauge.labels(dimension).set(score)
        LOGGER.debug(
            "Compliance metrics updated",
            extra={"event": "metrics_compliance", "data": scores},
        )


@contextmanager
def metrics_context(port: int) -> MetricsExporter:
    exporter = MetricsExporter(port)
    exporter.ensure_server()
    yield exporter


__all__ = ["MetricsExporter", "metrics_context"]
