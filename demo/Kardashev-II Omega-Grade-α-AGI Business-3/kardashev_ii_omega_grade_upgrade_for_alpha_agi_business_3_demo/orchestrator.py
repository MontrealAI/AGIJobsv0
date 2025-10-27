"""Upgraded orchestrator enriched with dashboards and owner controls."""

from __future__ import annotations

import asyncio
from typing import Any, Dict

from kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator as BaseOrchestrator,
)

from .config import OmegaOrchestratorConfig
from .dashboard import OmegaDashboard
from .owner import OwnerCommandStream
from .supervisor import LongRunSupervisor


class OmegaUpgradeOrchestrator(BaseOrchestrator):
    """Omega-grade orchestrator with enhanced operator tooling."""

    config: OmegaOrchestratorConfig

    def __init__(self, config: OmegaOrchestratorConfig) -> None:
        super().__init__(config)
        self.config = config
        self.dashboard = OmegaDashboard(
            config.status_dashboard_path,
            config.metrics_history_path,
        )
        self.owner_stream = OwnerCommandStream(
            config.control_channel_file,
            config.owner_command_ack_path,
        )
        self.supervisor = LongRunSupervisor(
            config.supervisor_summary_path,
            config.supervisor_interval_seconds,
            config.mission_target_hours,
        )
        self.bus.register_listener(self._observe_bus)

    async def start(self) -> None:
        await super().start()
        self._tasks.append(
            asyncio.create_task(self.supervisor.run(self), name="omega-supervisor")
        )

    def _append_snapshot_line(self, payload: Dict[str, Any]) -> None:
        super()._append_snapshot_line(payload)
        self.dashboard.update(payload)

    async def _observe_bus(self, topic: str, payload: Dict[str, Any], publisher: str) -> None:
        if topic == "control":
            ack_payload = {
                "topic": topic,
                "payload": payload,
                "publisher": publisher,
                "status": "accepted",
            }
            await asyncio.to_thread(self.owner_stream.acknowledge, ack_payload)
        elif topic.startswith("jobs:") or topic.startswith("results:"):
            self.dashboard.record_event(topic, payload, publisher)
