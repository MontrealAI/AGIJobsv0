"""Prometheus metrics exporter."""
from __future__ import annotations

import logging
import threading
from contextlib import suppress
from typing import Dict

from prometheus_client import Gauge, start_http_server

logger = logging.getLogger(__name__)


class MetricsExporter:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self._server_thread: threading.Thread | None = None
        self._gauges: Dict[str, Gauge] = {}

    def start(self) -> None:
        if self._server_thread and self._server_thread.is_alive():
            return

        def run_server() -> None:
            logger.info("Starting Prometheus exporter", extra={"host": self.host, "port": self.port})
            start_http_server(self.port, addr=self.host)

        self._server_thread = threading.Thread(target=run_server, daemon=True)
        self._server_thread.start()

    def update(self, metric: str, value: float, description: str = "") -> None:
        gauge = self._gauges.get(metric)
        if gauge is None:
            gauge = Gauge(metric, description or metric)
            self._gauges[metric] = gauge
        gauge.set(value)
        logger.debug("Updated metric", extra={"metric": metric, "value": value})

    def stop(self) -> None:
        if self._server_thread and self._server_thread.is_alive():
            with suppress(Exception):
                self._server_thread.join(timeout=0.1)
            logger.info("Prometheus exporter stopped")


__all__ = ["MetricsExporter"]
