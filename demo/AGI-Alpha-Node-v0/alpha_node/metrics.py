"""Prometheus-style metrics exporter."""
from __future__ import annotations

import http.server
import json
import threading
from typing import Dict

from .state import AlphaNodeState
from .logging_utils import get_logger

LOGGER = get_logger(__name__)


class MetricsExporter:
    def __init__(self, state: AlphaNodeState, port: int) -> None:
        self.state = state
        self.port = port
        self._server: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._server:
            return
        handler = self._make_handler()
        self._server = http.server.ThreadingHTTPServer(("0.0.0.0", self.port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        LOGGER.info("Metrics exporter online | port=%s", self.port)

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread:
            self._thread.join(timeout=1)
            self._thread = None
        LOGGER.info("Metrics exporter stopped")

    def _make_handler(self):  # type: ignore[override]
        state = self.state

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # pragma: no cover - exercised via integration tests
                if self.path == "/metrics":
                    payload = self._render_metrics()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain; version=0.0.4")
                    self.end_headers()
                    self.wfile.write(payload.encode("utf-8"))
                elif self.path == "/status":
                    snapshot = state.snapshot()
                    body = json.dumps(snapshot, indent=2)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(body.encode("utf-8"))
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, format: str, *args: object) -> None:  # pragma: no cover
                LOGGER.debug("Metrics request | %s", format % args)

            def _render_metrics(self) -> str:
                snapshot = state.snapshot()
                lines = [
                    "# HELP agi_alpha_node_compliance_score Composite compliance score",
                    "# TYPE agi_alpha_node_compliance_score gauge",
                    f"agi_alpha_node_compliance_score {snapshot['operations']['compliance_score']}",
                    "# HELP agi_alpha_node_completed_jobs Completed jobs",
                    "# TYPE agi_alpha_node_completed_jobs counter",
                    f"agi_alpha_node_completed_jobs {snapshot['operations']['completed_jobs']}",
                    "# HELP agi_alpha_node_rewards_accrued Rewards accrued",
                    "# TYPE agi_alpha_node_rewards_accrued counter",
                    f"agi_alpha_node_rewards_accrued {snapshot['economy']['rewards_accrued']}",
                ]
                return "\n".join(lines)

        return Handler


__all__ = ["MetricsExporter"]
