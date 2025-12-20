from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
)


def test_cycle_loop_respects_max_cycles(tmp_path: Path) -> None:
    async def _run() -> None:
        config = OrchestratorConfig(
            max_cycles=1,
            cycle_sleep_seconds=0.01,
            checkpoint_interval_seconds=1,
            enable_simulation=False,
            control_channel_file=tmp_path / "control.jsonl",
            checkpoint_path=tmp_path / "checkpoint.json",
            status_output_path=None,
            audit_log_path=None,
            energy_oracle_path=None,
        )
        orchestrator = Orchestrator(config)
        try:
            await orchestrator.start()
            await asyncio.wait_for(orchestrator.wait_until_stopped(), timeout=5)
            assert orchestrator._cycle == 1
        finally:
            await orchestrator.shutdown()

    asyncio.run(_run())
