"""Prometheus metrics exporter."""
from __future__ import annotations

import logging
import threading
from typing import Optional

from prometheus_client import Gauge, start_http_server

_LOGGER = logging.getLogger(__name__)

_COMPLIANCE_GAUGE = Gauge("agi_alpha_node_compliance_score", "Composite compliance score")
_STAKE_GAUGE = Gauge("agi_alpha_node_stake", "Current stake in wei")
_REWARD_GAUGE = Gauge("agi_alpha_node_rewards", "Unclaimed rewards in wei")
_JOB_COMPLETIONS = Gauge("agi_alpha_node_completed_jobs", "Total completed jobs")


class MetricsExporter:
    def __init__(self, port: int) -> None:
        self._port = port
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=start_http_server, args=(self._port,), daemon=True)
        self._thread.start()
        _LOGGER.info("Prometheus exporter started", extra={"port": self._port})

    def update_compliance(self, score: float) -> None:
        _COMPLIANCE_GAUGE.set(score)

    def update_stake(self, stake_wei: int) -> None:
        _STAKE_GAUGE.set(stake_wei)

    def update_rewards(self, rewards_wei: int) -> None:
        _REWARD_GAUGE.set(rewards_wei)

    def increment_completions(self, total: int) -> None:
        _JOB_COMPLETIONS.set(total)
