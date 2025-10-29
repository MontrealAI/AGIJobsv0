"""Primary Alpha Node runtime orchestrator."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, Optional

from web3 import Web3

from .compliance import ComplianceScorecard, ComplianceScores
from .config import AlphaNodeConfig
from .economy import StakeManagerClient, StakeStatus
from .ens import ENSVerificationResult, ENSVerifier
from .governance import GovernanceState, SystemPauseManager
from .jobs import TaskHarvester
from .knowledge import KnowledgeLake
from .logging_utils import configure_logging, get_logger
from .metrics import MetricsExporter
from .orchestrator import Orchestrator
from .planner import MuZeroPlanner
from .specialists import BaseSpecialist, SpecialistResult, build_specialist
from .state import AlphaNodeState

LOGGER = get_logger(__name__)


class AlphaNode:
    """High-level controller exposing a non-technical operator surface."""

    def __init__(
        self,
        config: AlphaNodeConfig,
        *,
        ens_verifier: Optional[ENSVerifier] = None,
        stake_client: Optional[StakeManagerClient] = None,
        task_harvester: Optional[TaskHarvester] = None,
        metrics: Optional[MetricsExporter] = None,
        pause_manager: Optional[SystemPauseManager] = None,
        web3: Optional[Web3] = None,
    ) -> None:
        configure_logging(config.storage.logs_path)
        self.config = config
        self.state = AlphaNodeState(governance_address=config.governance_address)
        self.knowledge = KnowledgeLake(config.storage.knowledge_path)
        self.web3 = web3 or Web3(Web3.HTTPProvider(config.rpc_url))
        self.ens = ens_verifier or ENSVerifier(config.rpc_url)
        self.stake_client = stake_client or StakeManagerClient(
            self.web3,
            config.staking.stake_manager_address,
            int(config.staking.min_stake_wei),
            [token.__dict__ for token in config.staking.reward_tokens],
        )
        governance_state_path = config.storage.logs_path.with_suffix(".governance.json")
        self.pause_manager = pause_manager or SystemPauseManager(self.web3, governance_state_path)
        try:
            self.pause_manager.load()
        except FileNotFoundError:
            self.pause_manager.bootstrap(
                config.owner_address,
                config.governance_address,
                config.security.pause_contract,
            )
        self.state.set_paused(self.pause_manager.state.paused)
        self.compliance = ComplianceScorecard()
        self.metrics = metrics or MetricsExporter(config.metrics.prometheus_port)
        self.planner = MuZeroPlanner(
            depth=config.planner.search_depth,
            exploration_constant=config.planner.exploration_constant,
            learning_rate=config.planner.learning_rate,
            knowledge=self.knowledge,
        )
        specialists = self._build_specialists(config)
        self.orchestrator = Orchestrator(self.planner, self.knowledge, specialists)
        jobs_path = self._ensure_jobs_file_exists(config.storage.knowledge_path.parent)
        self.harvester = task_harvester or TaskHarvester(jobs_path, loop=True)
        self.running = False

    def bootstrap(self) -> ComplianceScores:
        """Verify identity, surface initial metrics, and emit a compliance snapshot."""

        ens_result = self.ens.verify(self.config.identity.ens_domain, self.config.owner_address)
        self.state.set_ens_verified(ens_result.verified)
        if not ens_result.verified:
            raise RuntimeError("ENS verification failed; aborting activation")
        stake_status = self.stake_client.status()
        self.state.update_stake(stake_status.staked_wei)
        self.state.set_rewards(stake_status.rewards_wei)
        self.metrics.start()
        scores = self._evaluate_compliance(ens_result, stake_status)
        LOGGER.info(
            "Alpha Node bootstrapped",
            extra={
                "ens_domain": self.config.identity.ens_domain,
                "stake": stake_status.staked_wei,
                "compliance": scores.total,
            },
        )
        return scores

    def pause(self, reason: str = "operator-request") -> GovernanceState:
        state = self.pause_manager.pause(reason)
        self.state.set_paused(state.paused)
        self._evaluate_compliance()
        LOGGER.warning("System paused", extra={"reason": reason})
        return state

    def resume(self, note: str = "operator-resume") -> GovernanceState:
        state = self.pause_manager.resume(note)
        self.state.set_paused(state.paused)
        self._evaluate_compliance()
        LOGGER.info("System resumed", extra={"note": note})
        return state

    def update_governance(self, address: str, justification: str = "governance-rotation") -> GovernanceState:
        state = self.pause_manager.rotate_governance(address, justification)
        self.state.set_governance_address(state.governance_address)
        self._evaluate_compliance()
        return state

    def stake(self, amount_wei: int) -> StakeStatus:
        status = self.stake_client.deposit(amount_wei, self.config.owner_address)
        self.state.update_stake(status.staked_wei)
        self.metrics.update_stake(status.staked_wei)
        self._evaluate_compliance(stake_status=status)
        return status

    def withdraw(self, amount_wei: int) -> StakeStatus:
        status = self.stake_client.withdraw(amount_wei)
        self.state.update_stake(status.staked_wei)
        self.metrics.update_stake(status.staked_wei)
        self._evaluate_compliance(stake_status=status)
        return status

    def claim_rewards(self) -> Iterable[str]:
        rewards = self.stake_client.claim_rewards(self.config.owner_address)
        self.state.set_rewards(0)
        self.metrics.update_rewards(0)
        LOGGER.info("Rewards claimed", extra={"tokens": [token.symbol for token in rewards]})
        self._evaluate_compliance()
        return [token.symbol for token in rewards]

    def run_safety_drill(self) -> None:
        LOGGER.info("Running emergency pause drill")
        self.pause("drill")
        time.sleep(0.1)
        self.state.record_drill()
        self.resume("drill-complete")
        self._evaluate_compliance()

    def compliance_report(self) -> ComplianceScores:
        return self._evaluate_compliance()

    def run_once(self) -> Optional[SpecialistResult]:
        if self.state.governance.paused:
            LOGGER.warning("Skipping execution while paused")
            return None
        job = self.harvester.next_job()
        if job is None:
            LOGGER.info("No jobs available for execution")
            return None
        outcome = self.orchestrator.execute([job.to_planner_dict()])
        reward_wei = int(outcome.result.reward_estimate * 1e18)
        status = self.stake_client.accrue_rewards(reward_wei)
        self.state.accrue_rewards(reward_wei)
        self.state.register_completion(job.job_id, success=True)
        self.metrics.update_rewards(status.rewards_wei)
        self.metrics.update_stake(status.staked_wei)
        self.metrics.increment_completions(self.state.ops.completed_jobs)
        self.state.set_metric("last_reward_wei", reward_wei)
        self._evaluate_compliance(stake_status=status)
        LOGGER.info(
            "Job executed",
            extra={
                "job_id": outcome.plan.job_id,
                "specialist": outcome.result.specialist,
                "reward_estimate": outcome.result.reward_estimate,
            },
        )
        return outcome.result

    def run_forever(self) -> None:
        self.running = True
        LOGGER.info("Alpha Node entering autonomous mode")
        while self.running:
            try:
                self.run_once()
            except Exception as exc:  # pragma: no cover - defensive loop guard
                LOGGER.exception("Autonomous loop error", exc_info=exc)
                self.pause("autonomous-error")
            time.sleep(max(self.config.jobs.poll_interval_seconds, 1))

    def shutdown(self) -> None:
        self.running = False
        self.harvester.stop()
        self.metrics.stop()
        LOGGER.info("Alpha Node shutdown complete")

    def _evaluate_compliance(
        self,
        ens_result: Optional[ENSVerificationResult] = None,
        stake_status: Optional[StakeStatus] = None,
    ) -> ComplianceScores:
        ens_snapshot = ens_result or self.ens.verify(self.config.identity.ens_domain, self.config.owner_address)
        stake_snapshot = stake_status or self.stake_client.status()
        scores = self.compliance.evaluate(
            ens_result=ens_snapshot,
            stake_status=stake_snapshot,
            governance=self.pause_manager.state,
            planner_trend=self._planner_trend(),
            antifragility_checks={
                "drill": self.state.ops.drills_completed > 0,
                "pause_resume": not self.pause_manager.state.paused,
            },
        )
        self.state.set_compliance(scores.total)
        self.metrics.update_compliance(scores.total)
        return scores

    def _planner_trend(self) -> float:
        completed = self.state.ops.completed_jobs
        return min(1.0, 0.6 + completed * 0.05)

    def _build_specialists(self, config: AlphaNodeConfig) -> Dict[str, BaseSpecialist]:
        specialists: Dict[str, BaseSpecialist] = {}
        for spec in config.enabled_specialists():
            specialist = build_specialist(spec.domain, self.knowledge)
            specialist.name = spec.name  # type: ignore[attr-defined]
            specialists[spec.domain.lower()] = specialist
        if not specialists:
            # Fallback to default roster to keep the node productive.
            for spec in config.specialists:
                specialist = build_specialist(spec.domain, self.knowledge)
                specialists[spec.domain.lower()] = specialist
        return specialists

    def _ensure_jobs_file_exists(self, directory: Path) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        jobs_path = directory / "jobs.json"
        if jobs_path.exists():
            return jobs_path
        default_jobs = Path(__file__).resolve().parent.parent / "jobs" / "demo_jobs.json"
        payload = json.dumps([], indent=2)
        if default_jobs.exists():
            payload = default_jobs.read_text(encoding="utf-8")
        jobs_path.write_text(payload, encoding="utf-8")
        return jobs_path


__all__ = ["AlphaNode"]
