"""Prometheus metrics exporter."""
from __future__ import annotations

import importlib.util
import logging
import threading
from contextlib import suppress
from typing import Dict

logger = logging.getLogger(__name__)

_PROMETHEUS_AVAILABLE = importlib.util.find_spec("prometheus_client") is not None

if _PROMETHEUS_AVAILABLE:
    from prometheus_client import Gauge, start_http_server
else:

    class Gauge:  # type: ignore[override]
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def set(self, *_args: object, **_kwargs: object) -> None:
            pass

    def start_http_server(*_args: object, **_kwargs: object) -> None:
        logger.warning("Prometheus metrics disabled; prometheus_client is not installed.")


class MetricsExporter:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self._server_thread: threading.Thread | None = None
        self._gauges: Dict[str, Gauge] = {}
        self._enabled = _PROMETHEUS_AVAILABLE

    def start(self) -> None:
        if not self._enabled:
            logger.warning("Prometheus metrics disabled; prometheus_client is not installed.")
            return
        if self._server_thread and self._server_thread.is_alive():
            return

        def run_server() -> None:
            logger.info("Starting Prometheus exporter", extra={"host": self.host, "port": self.port})
            start_http_server(self.port, addr=self.host)

        self._server_thread = threading.Thread(target=run_server, daemon=True)
        self._server_thread.start()

    def update(self, metric: str, value: float, description: str = "") -> None:
        if not self._enabled:
            return
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
