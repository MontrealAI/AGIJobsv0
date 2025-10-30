"""Prometheus-style metrics endpoint."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from typing import Callable

from .state import StateStore


class MetricsServer(Thread):
    """Tiny HTTP server exporting node metrics."""

    def __init__(self, host: str, port: int, store: StateStore) -> None:
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self.store = store
        self.httpd: ThreadingHTTPServer | None = None

    def run(self) -> None:  # pragma: no cover - network IO
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self_inner):
                state = self.store.read()
                reason = state.last_safety_violation or "none"
                reason_label = (
                    reason.replace("\\", "\\\\").replace("\"", "\\\"")
                )
                payload = "\n".join(
                    [
                        "# HELP agi_alpha_node_paused Whether the node is paused",
                        "# TYPE agi_alpha_node_paused gauge",
                        f"agi_alpha_node_paused {1 if state.paused else 0}",
                        "# HELP agi_alpha_node_total_rewards Total rewards accrued",
                        "# TYPE agi_alpha_node_total_rewards counter",
                        f"agi_alpha_node_total_rewards {state.total_rewards}",
                        "# HELP agi_alpha_node_stake_locked Stake locked",
                        "# TYPE agi_alpha_node_stake_locked gauge",
                        f"agi_alpha_node_stake_locked {state.stake_locked}",
                        "# HELP agi_alpha_node_compliance_score Composite compliance score",
                        "# TYPE agi_alpha_node_compliance_score gauge",
                        f"agi_alpha_node_compliance_score {state.compliance_score}",
                        "# HELP agi_alpha_node_last_safety_violation Last safety halt recorded",
                        "# TYPE agi_alpha_node_last_safety_violation gauge",
                        f'agi_alpha_node_last_safety_violation{{reason="{reason_label}"}} '
                        f"{1 if state.last_safety_violation else 0}",
                        "# HELP agi_alpha_node_antifragility_index Antifragility index",
                        "# TYPE agi_alpha_node_antifragility_index gauge",
                        f"agi_alpha_node_antifragility_index {state.antifragility_index}",
                        "# HELP agi_alpha_node_strategic_alpha Strategic alpha index",
                        "# TYPE agi_alpha_node_strategic_alpha gauge",
                        f"agi_alpha_node_strategic_alpha {state.strategic_alpha_index}",
                        "# HELP agi_alpha_node_active_jobs Active job count",
                        "# TYPE agi_alpha_node_active_jobs gauge",
                        f"agi_alpha_node_active_jobs {state.active_jobs}",
                    ]
                )
                self_inner.send_response(200)
                self_inner.send_header("Content-Type", "text/plain; version=0.0.4")
                self_inner.end_headers()
                self_inner.wfile.write(payload.encode("utf-8"))

            def log_message(self_inner, format: str, *args) -> None:
                return

        self.httpd = ThreadingHTTPServer((self.host, self.port), Handler)
        self.httpd.serve_forever()

    def stop(self) -> None:
        if self.httpd:
            self.httpd.shutdown()


__all__ = ["MetricsServer"]
