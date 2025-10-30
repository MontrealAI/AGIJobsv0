from __future__ import annotations

import logging
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict

logger = logging.getLogger(__name__)


class MetricRegistry:
    def __init__(self) -> None:
        self._values: Dict[str, float] = {}
        self._lock = threading.RLock()

    def set_metric(self, name: str, value: float) -> None:
        with self._lock:
            self._values[name] = value
            logger.debug("Metric updated", extra={"context": {name: value}})

    def snapshot(self) -> Dict[str, float]:
        with self._lock:
            return dict(self._values)


class _Handler(BaseHTTPRequestHandler):
    registry: MetricRegistry

    def do_GET(self) -> None:  # noqa: N802 - HTTP verb
        data = self.registry.snapshot()
        lines = [f"{key} {value}" for key, value in data.items()]
        body = "\n".join(lines).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: D401 - disable std logging
        logger.debug("Prometheus server: %s", format % args)


class PrometheusServer:
    def __init__(self, registry: MetricRegistry, port: int) -> None:
        self.registry = registry
        self.port = port
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def _serve() -> None:
            server = HTTPServer(("0.0.0.0", self.port), type("Handler", (_Handler,), {"registry": self.registry}))
            logger.info("Prometheus exporter listening", extra={"context": {"port": self.port}})
            server.serve_forever()

        self._thread = threading.Thread(target=_serve, daemon=True)
        self._thread.start()


__all__ = ["MetricRegistry", "PrometheusServer"]
