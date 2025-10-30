"""Alpha Node runtime bringing all components together."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from decimal import Decimal
from pathlib import Path
from typing import Dict, Optional

from uvicorn import Config, Server

from ..blockchain.client import BlockchainClient, MockBlockchainClient
from ..blockchain.ens import ENSVerifier
from ..blockchain.governance import GovernanceController, SystemPauseController
from ..blockchain.jobs import JobRegistry
from ..blockchain.staking import StakeManager
from ..compliance.scorecard import ComplianceScorecard
from ..config import AlphaNodeConfig, cached_config, ensure_directories
from ..knowledge.lake import KnowledgeLake
from ..metrics.hub import MetricsHub
from ..metrics.server import create_api
from ..safety.guards import SafetyManager
from ..specialists.base import Specialist
from ..specialists.biotech import BiotechSynthesist
from ..specialists.finance import FinanceStrategist
from ..specialists.manufacturing import ManufacturingOptimizer
from .orchestrator import Orchestrator
from .planner import Planner
from .task_harvester import TaskHarvester

LOGGER = logging.getLogger(__name__)

SPECIALIST_REGISTRY = {
    "finance": FinanceStrategist,
    "biotech": BiotechSynthesist,
    "manufacturing": ManufacturingOptimizer,
}


class AlphaNodeRuntime:
    def __init__(self, config: AlphaNodeConfig, base_path: Optional[Path] = None, offline: bool = False) -> None:
        self.config = config
        self.base_path = base_path or Path(__file__).resolve().parents[3]
        self.offline = offline or bool(int(os.environ.get("AGI_ALPHA_NODE_OFFLINE", "0")))
        self.metrics = MetricsHub()
        self.metrics.bootstrap()
        self.knowledge = KnowledgeLake((self.base_path / config.knowledge_lake.path).resolve())
        ensure_directories([self.base_path / "logs"])
        self.total_rewards = 0.0

        if self.offline:
            self.blockchain = MockBlockchainClient(config, self.base_path)
        else:
            self.blockchain = BlockchainClient(config, self.base_path)
        self.stake_manager = StakeManager(self.blockchain, Decimal(config.minimum_stake))
        self.ens_verifier = ENSVerifier(self.blockchain, config.ens_domain, config.operator_address)
        self.job_registry = JobRegistry(self.blockchain)
        self.task_harvester = TaskHarvester(self.job_registry, self.base_path, config.jobs.source)
        self.system_pause = SystemPauseController(self.blockchain)
        self.governance = GovernanceController(self.blockchain)
        self.safety = SafetyManager(self.metrics)

        planner_cfg = config.planner
        self.planner = Planner(
            knowledge=self.knowledge,
            rollout_depth=planner_cfg.rollout_depth,
            exploration_constant=planner_cfg.exploration_constant,
            simulations=planner_cfg.simulations,
        )
        specialists: Dict[str, Specialist] = {}
        for entry in config.specialists:
            specialist_cls = SPECIALIST_REGISTRY.get(entry.module)
            if specialist_cls is None:
                LOGGER.warning("Unknown specialist module %s", entry.module)
                continue
            specialists[entry.module] = specialist_cls(self.knowledge)
        self.orchestrator = Orchestrator(self.planner, specialists, self.metrics)
        self.scorecard = ComplianceScorecard()

    async def run_once(self) -> Dict[str, object]:
        LOGGER.info("Running single Alpha Node iteration")
        if not self.offline:
            self.blockchain.ensure_connection()
        ens_result = self.ens_verifier.verify()
        stake_status = self.stake_manager.ensure_minimum_stake(self.config.operator_address)
        pause_status = self.system_pause.status()
        safety_snapshot = self.safety.evaluate(pause_status.paused, stake_status.meets_threshold, ens_result.verified)

        jobs = self.task_harvester.load_jobs()
        execution_results = self.orchestrator.execute(jobs)
        rewards = sum(float(job.get("reward", 0)) for job in jobs)
        self.total_rewards += rewards
        self.metrics.add_rewards(self.total_rewards)

        intelligence_score = self.orchestrator.intelligence_score()
        compliance = self.scorecard.compute(
            ens_verified=ens_result.verified,
            stake_ok=stake_status.meets_threshold,
            governance_address=self.config.governance_address,
            pause_status=pause_status.paused,
            rewards_growth=min(self.total_rewards / 1000.0, 1.0),
            antifragility_score=safety_snapshot.antifragility_score,
            intelligence_score=intelligence_score,
        )
        self.metrics.compliance_summary(compliance.total * 100)

        payload = {
            "ens": ens_result.as_dict(),
            "stake": stake_status.as_dict(),
            "pause": pause_status.as_dict(),
            "safety": safety_snapshot.as_dict(),
            "results": execution_results,
            "compliance": compliance.as_dict(),
            "rewards_total": self.total_rewards,
        }
        self._persist_run(payload)
        return payload

    def _persist_run(self, payload: Dict[str, object]) -> None:
        log_dir = self.base_path / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "alpha_node_runs.jsonl"
        with log_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")

    async def serve(self, host: str, port: int) -> None:
        app = create_api(self.metrics)
        config = Config(app=app, host=host, port=port, log_level="info")
        server = Server(config)
        await server.serve()

    async def run_forever(self, host: str, port: int, interval: float = 10.0) -> None:
        server_task = asyncio.create_task(self.serve(host, port))
        try:
            while True:
                await self.run_once()
                await asyncio.sleep(interval)
        finally:
            server_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await server_task


def build_runtime(config_path: Optional[str] = None, offline: bool = False) -> AlphaNodeRuntime:
    config = cached_config(config_path)
    return AlphaNodeRuntime(config=config, offline=offline)
