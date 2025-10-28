"""Primary Alpha Node runtime."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, Optional

from .blockchain import BlockchainInteractor
from .compliance import ComplianceEngine
from .config import AlphaNodeConfig
from .ens import ENSVerifier
from .jobs import TaskHarvester
from .knowledge import KnowledgeLake
from .logging_utils import configure_logging, get_logger
from .metrics import MetricsExporter
from .planner import MuZeroPlanner
from .specialists import SpecialistAgent, SpecialistResult, build_specialist
from .orchestrator import Orchestrator
from .state import AlphaNodeState

LOGGER = get_logger(__name__)


class AlphaNode:
    """High-level orchestrator for the demo."""

    def __init__(self, config: AlphaNodeConfig, ens_cache: Optional[Path] = None) -> None:
        configure_logging(config.log_path)
        self.config = config
        self.state = AlphaNodeState(governance_address=config.governance_address)
        self.knowledge = KnowledgeLake(config.knowledge_path)
        self.blockchain = BlockchainInteractor(
            job_registry_address=config.job_registry_address,
            stake_manager_address=config.stake_manager_address,
            incentives_address=config.incentives_address,
            treasury_address=config.treasury_address,
            required_stake=config.stake_threshold,
        )
        self.ens = ENSVerifier(config.rpc_url, cache_path=ens_cache)
        self.compliance = ComplianceEngine(self.state, config.stake_threshold)
        self.planner = MuZeroPlanner(
            horizon=config.planning_horizon,
            exploration_bias=config.exploration_bias,
            knowledge=self.knowledge,
        )
        self.specialists: Dict[str, SpecialistAgent] = {}
        for spec in config.enabled_specialists():
            domain = spec.name.lower()
            self.specialists[domain] = build_specialist(
                domain=domain,
                name=spec.name,
                description=spec.description,
                risk_limit=spec.risk_limit,
            )
        self.orchestrator = Orchestrator(
            planner=self.planner,
            specialists=self.specialists,
            knowledge=self.knowledge,
            state=self.state,
        )
        jobs_path = config.knowledge_path.parent / "jobs.json"
        if not jobs_path.exists():
            default_jobs = Path(__file__).resolve().parent.parent / "jobs" / "demo_jobs.json"
            if default_jobs.exists():
                jobs_path.write_text(default_jobs.read_text(encoding="utf-8"), encoding="utf-8")
            else:
                jobs_path.write_text(json.dumps([], indent=2), encoding="utf-8")
        self.harvester = TaskHarvester(jobs_path, loop=True)
        self.metrics = MetricsExporter(self.state, config.metrics_port)
        self.running = False

    def bootstrap(self) -> None:
        result = self.ens.verify(self.config.ens_domain, self.config.owner_address)
        self.state.set_ens_verified(result.verified)
        if not result.verified:
            raise RuntimeError("ENS verification failed")
        stake_status = self.blockchain.status(self.config.owner_address)
        self.state.update_stake(stake_status.staked_amount)
        if not stake_status.active:
            LOGGER.warning(
                "Stake below threshold | required=%s current=%s",
                stake_status.required_amount,
                stake_status.staked_amount,
            )
        if self.config.enable_prometheus:
            self.metrics.start()
        self.compliance.evaluate()
        LOGGER.info("Alpha Node bootstrapped | domain=%s", self.config.ens_domain)

    def pause(self) -> None:
        self.state.set_paused(True)
        LOGGER.warning("System paused by operator")

    def resume(self) -> None:
        self.state.set_paused(False)
        LOGGER.info("System resumed by operator")

    def run_once(self) -> Optional[SpecialistResult]:
        if self.state.governance.paused:
            LOGGER.warning("Attempted to run while paused")
            return None
        job = self.harvester.next_job()
        if not job:
            LOGGER.info("No jobs available")
            return None
        result = self.orchestrator.execute_job(job)
        self.blockchain.grant_rewards(self.config.owner_address, int(result.specialist_result.reward_delta))
        self.state.accrue_rewards(int(result.specialist_result.reward_delta))
        self.compliance.evaluate()
        return result.specialist_result

    def run_forever(self) -> None:
        self.running = True
        LOGGER.info("Alpha Node entering autonomous mode")
        while self.running:
            try:
                self.run_once()
            except Exception as exc:
                LOGGER.exception("Autonomous loop error: %s", exc)
                self.pause()
            time.sleep(self.config.job_poll_interval)

    def shutdown(self) -> None:
        self.running = False
        self.metrics.stop()
        LOGGER.info("Alpha Node shutdown complete")


__all__ = ["AlphaNode"]
