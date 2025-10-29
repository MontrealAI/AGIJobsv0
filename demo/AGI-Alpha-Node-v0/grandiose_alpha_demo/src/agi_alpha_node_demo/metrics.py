"""Minimal Prometheus-style metrics exporter."""
from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Dict

MetricProvider = Callable[[], Dict[str, float]]


class MetricsRegistry:
    """Collects providers and exposes pull-based metrics."""

    def __init__(self) -> None:
        self._providers: Dict[str, MetricProvider] = {}

    def register(self, name: str, provider: MetricProvider) -> None:
        self._providers[name] = provider

    def snapshot(self) -> Dict[str, float]:
        result: Dict[str, float] = {}
        for name, provider in self._providers.items():
            metrics = provider()
            for metric, value in metrics.items():
                result[f"{name}_{metric}"] = value
        return result


class _MetricsHandler(BaseHTTPRequestHandler):
    registry: MetricsRegistry

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return
        payload = self.registry.snapshot()
        body = "\n".join(f"{key} {value:.4f}" for key, value in sorted(payload.items()))
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - signature mandated
        return


class MetricsServer:
    """Background HTTP server exposing node metrics."""

    def __init__(self, host: str, port: int, registry: MetricsRegistry) -> None:
        self._host = host
        self._port = port
        self._registry = registry
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def _run() -> None:
            HTTPServer.allow_reuse_address = True
            address = (self._host, self._port)
            try:
                httpd = HTTPServer(address, _MetricsHandler)
            except OSError:
                httpd = HTTPServer((self._host, 0), _MetricsHandler)
                self._port = httpd.server_port
            _MetricsHandler.registry = self._registry
            httpd.serve_forever()

        self._thread = threading.Thread(target=_run, daemon=True)
        self._thread.start()

    def export_state(self) -> Dict[str, str]:
        return {"metrics_endpoint": f"http://{self._host}:{self._port}/metrics"}
