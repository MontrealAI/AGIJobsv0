"""Prometheus metrics exporter."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Dict
import json
import logging
import time

LOGGER = logging.getLogger(__name__)


class MetricsRegistry:
    def __init__(self) -> None:
        self._gauges: Dict[str, float] = {}

    def set_gauge(self, name: str, value: float) -> None:
        LOGGER.debug("Setting gauge", extra={"metric": name, "value": value})
        self._gauges[name] = float(value)

    def to_prometheus(self) -> str:
        lines = []
        for metric, value in sorted(self._gauges.items()):
            lines.append(f"# TYPE {metric} gauge")
            lines.append(f"{metric} {value}")
        return "\n".join(lines) + "\n"

    def to_json(self) -> str:
        return json.dumps(self._gauges, indent=2)


class MetricsHandler(BaseHTTPRequestHandler):
    registry: MetricsRegistry | None = None

    def do_GET(self) -> None:  # noqa: N802 - HTTP server signature
        if self.path == "/metrics":
            self._respond(200, "text/plain; version=0.0.4", self.registry.to_prometheus())
        elif self.path == "/healthz":
            self._respond(200, "application/json", json.dumps({"status": "ok"}))
        else:
            self._respond(404, "application/json", json.dumps({"error": "not found"}))

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003
        LOGGER.debug("HTTP request", extra={"message": format % args})

    def _respond(self, code: int, content_type: str, body: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))


class MetricsServer:
    def __init__(self, host: str, port: int, registry: MetricsRegistry) -> None:
        self._host = host
        self._port = port
        self._registry = registry
        self._thread: Thread | None = None
        self._httpd: HTTPServer | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        MetricsHandler.registry = self._registry
        self._httpd = HTTPServer((self._host, self._port), MetricsHandler)
        LOGGER.info("Metrics server starting", extra={"host": self._host, "port": self._port})
        self._thread = Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._httpd:
            LOGGER.info("Metrics server stopping")
            self._httpd.shutdown()
            self._httpd.server_close()
        if self._thread:
            self._thread.join(timeout=5)


def hydrate_metrics(registry: MetricsRegistry, compliance_score: float, rewards_claimed: float, active_jobs: int) -> None:
    registry.set_gauge("agi_alpha_node_compliance_score", compliance_score)
    registry.set_gauge("agi_alpha_node_rewards_claimed", rewards_claimed)
    registry.set_gauge("agi_alpha_node_active_jobs", active_jobs)
    registry.set_gauge("agi_alpha_node_timestamp", time.time())


__all__ = ["MetricsRegistry", "MetricsServer", "hydrate_metrics"]
