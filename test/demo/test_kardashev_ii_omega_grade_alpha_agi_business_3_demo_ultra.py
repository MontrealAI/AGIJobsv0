from __future__ import annotations

import asyncio
import unittest
from pathlib import Path

from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.config import (
    load_ultra_config,
)
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.orchestrator import (
    UltraOrchestrator,
)


_FIXTURE_CONFIG = (
    Path(__file__).resolve().parents[2]
    / "demo"
    / "Kardashev-II Omega-Grade-α-AGI Business-3"
    / "kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra"
    / "config"
    / "mission.json"
)


class UltraDemoConfigTests(unittest.TestCase):
    def test_load_config(self) -> None:
        config = load_ultra_config(_FIXTURE_CONFIG)
        self.assertGreater(config.mission.runtime_hours, 0)
        self.assertGreater(len(config.mission.job_plan), 0)
        self.assertGreater(len(config.mission.job_plan[0].children), 0)
        self.assertGreater(config.orchestrator.energy_capacity, 0)


class UltraDemoRuntimeTests(unittest.TestCase):
    def test_orchestrator_bootstrap_and_shutdown(self) -> None:
        config = load_ultra_config(_FIXTURE_CONFIG)
        config.orchestrator.max_cycles = 4
        config.orchestrator.cycle_sleep_seconds = 0.01
        config.orchestrator.checkpoint_interval_seconds = 0.05
        config.mission.runtime_hours = 0.0003
        config.mission.archive_interval_seconds = 0.05
        config.orchestrator.resume_from_checkpoint = False
        config.orchestrator.checkpoint_path = Path("artifacts/test/ultra-demo-checkpoint.json")

        orchestrator = UltraOrchestrator(config)

        async def _run() -> None:
            await orchestrator.start()
            await asyncio.sleep(0.15)
            await orchestrator.shutdown()

        asyncio.run(_run())


if __name__ == "__main__":  # pragma: no cover - test entrypoint
    unittest.main()
