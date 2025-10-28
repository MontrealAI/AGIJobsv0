from __future__ import annotations

import http.server
import socketserver
import threading
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class Gauge:
    name: str
    help: str
    value: float = 0.0


@dataclass
class Counter:
    name: str
    help: str
    value: float = 0.0


class MetricsRegistry:
    def __init__(self) -> None:
        self._gauges: Dict[str, Gauge] = {}
        self._counters: Dict[str, Counter] = {}
        self._lock = threading.Lock()

    def gauge(self, name: str, help_text: str) -> Gauge:
        with self._lock:
            gauge = self._gauges.setdefault(name, Gauge(name=name, help=help_text))
            return gauge

    def counter(self, name: str, help_text: str) -> Counter:
        with self._lock:
            counter = self._counters.setdefault(name, Counter(name=name, help=help_text))
            return counter

    def set_gauge(self, name: str, value: float) -> None:
        gauge = self.gauge(name, help_text="")
        gauge.value = float(value)

    def inc_counter(self, name: str, value: float = 1.0) -> None:
        counter = self.counter(name, help_text="")
        counter.value += float(value)

    def render(self) -> str:
        with self._lock:
            lines = []
            for gauge in self._gauges.values():
                lines.append(f"# HELP {gauge.name} {gauge.help}")
                lines.append(f"# TYPE {gauge.name} gauge")
                lines.append(f"{gauge.name} {gauge.value:.6f}")
            for counter in self._counters.values():
                lines.append(f"# HELP {counter.name} {counter.help}")
                lines.append(f"# TYPE {counter.name} counter")
                lines.append(f"{counter.name} {counter.value:.6f}")
            return "\n".join(lines) + "\n"


class _MetricsHandler(http.server.BaseHTTPRequestHandler):
    registry: MetricsRegistry

    def do_GET(self) -> None:  # noqa: N802  # pragma: no cover - exercised via integration tests
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return
        payload = self.registry.render().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class MetricsServer:
    def __init__(self, registry: MetricsRegistry, port: int) -> None:
        self.registry = registry
        self.port = port
        self._server: Optional[socketserver.TCPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        handler = type("MetricsHandler", (_MetricsHandler,), {"registry": self.registry})
        self._server = socketserver.TCPServer(("", self.port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        if self._thread:
            self._thread.join(timeout=1)


__all__ = ["MetricsRegistry", "MetricsServer", "Gauge", "Counter"]
