from __future__ import annotations

import asyncio
import sys
import unittest
from datetime import timedelta
from pathlib import Path

PACKAGE_PARENT = Path(__file__).resolve().parents[1]
if str(PACKAGE_PARENT) not in sys.path:
    sys.path.append(str(PACKAGE_PARENT))

from kardashev_ii_omega_grade_alpha_agi_business_3.agents import (
    EnergyAgent,
    FinanceAgent,
    SupplyChainAgent,
    ValidatorAgent,
)
from kardashev_ii_omega_grade_alpha_agi_business_3.config import DemoConfig
from kardashev_ii_omega_grade_alpha_agi_business_3.governance import GovernanceConsole
from kardashev_ii_omega_grade_alpha_agi_business_3.messaging import MessageBus
from kardashev_ii_omega_grade_alpha_agi_business_3.orchestrator import Orchestrator
from kardashev_ii_omega_grade_alpha_agi_business_3.resources import ResourceManager
from kardashev_ii_omega_grade_alpha_agi_business_3.simulation import SyntheticEconomySim
from kardashev_ii_omega_grade_alpha_agi_business_3.state import JobStatus


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        checkpoint = Path("/tmp/omega_test_checkpoint.json")
        if checkpoint.exists():
            checkpoint.unlink()
        self.config = DemoConfig(
            owner="omega-owner",
            validator_count=2,
            commit_window=timedelta(milliseconds=5),
            reveal_window=timedelta(milliseconds=5),
            checkpoint_interval=timedelta(milliseconds=20),
            checkpoint_path=str(checkpoint),
        )
        self.bus = MessageBus()
        self.resources = ResourceManager(self.config)
        self.governance = GovernanceConsole(self.config)
        self.simulation = SyntheticEconomySim()
        self.orchestrator = Orchestrator(
            self.config,
            bus=self.bus,
            resources=self.resources,
            governance=self.governance,
            simulation=self.simulation,
        )
        agents = [
            FinanceAgent("finance_alpha", ["finance"], self.orchestrator, self.bus, self.resources),
            EnergyAgent("energy_alpha", ["energy"], self.orchestrator, self.bus, self.resources),
            SupplyChainAgent("supply_chain_alpha", ["supply_chain"], self.orchestrator, self.bus, self.resources),
        ]
        validators = [
            ValidatorAgent("validator_0", [], self.orchestrator, self.bus, self.resources),
            ValidatorAgent("validator_1", [], self.orchestrator, self.bus, self.resources),
        ]
        self.orchestrator.register_agents(agents, validators=validators)
        await self.orchestrator.start()

    async def asyncTearDown(self) -> None:
        await self.orchestrator.stop()

    async def test_job_lifecycle_completes_and_rewards_agent(self) -> None:
        job_id = await self.orchestrator.post_alpha_job(
            {
                "skills": ["finance"],
                "description": "Construct energy arbitrage thesis",
                "compute": 1.5,
                "energy_gw": 1.0,
            },
            employer=self.config.owner,
            reward=2_500.0,
        )
        await asyncio.sleep(0.2)
        job = self.orchestrator.jobs()[job_id]
        self.assertEqual(job.status, JobStatus.COMPLETED)
        balances = self.orchestrator.balances()["finance_alpha"]
        self.assertGreaterEqual(balances["balance"], 0.0)

    async def test_governance_pause_blocks_new_assignments(self) -> None:
        self.governance.pause(caller=self.config.owner)
        job_id = await self.orchestrator.post_alpha_job(
            {"skills": ["energy"], "description": "Spin down reactor", "compute": 0.5},
            employer=self.config.owner,
            reward=1_000.0,
        )
        await asyncio.sleep(0.05)
        job = self.orchestrator.jobs()[job_id]
        self.assertEqual(job.status, JobStatus.POSTED)
        self.governance.resume(caller=self.config.owner)
        await asyncio.sleep(0.2)
        job = self.orchestrator.jobs()[job_id]
        self.assertIn(job.status, (JobStatus.IN_PROGRESS, JobStatus.COMPLETED, JobStatus.AWAITING_VALIDATION))

    async def test_delegation_creates_child_job(self) -> None:
        job_id = await self.orchestrator.post_alpha_job(
            {
                "skills": ["finance"],
                "description": "Launch multi-sector expansion",
                "compute": 2.0,
                "energy_gw": 1.0,
                "spawn_supply_chain": True,
            },
            employer=self.config.owner,
            reward=3_000.0,
        )
        await asyncio.sleep(0.3)
        job = self.orchestrator.jobs()[job_id]
        self.assertTrue(job.children)
        for child_id in job.children:
            self.assertIn(child_id, self.orchestrator.jobs())


if __name__ == "__main__":
    unittest.main()
