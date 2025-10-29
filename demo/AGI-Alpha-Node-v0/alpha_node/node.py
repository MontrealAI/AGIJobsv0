"""High-level runtime facade for the AGI Alpha Node demo."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .compliance import ComplianceEngine, ComplianceReport
from .config import AlphaNodeConfig
from .ens import ENSVerifier
from .governance import GovernanceController, GovernanceStatus
from .jobs import JobRegistry, TaskHarvester
from .knowledge import KnowledgeLake
from .metrics import MetricsServer
from .orchestrator import AlphaOrchestrator, ExecutionReport, build_specialists
from .planner import MuZeroPlanner
from .stake import StakeEvent, StakeManager
from .state import NodeState, StateStore


class AlphaNode:
    """Coordinate the demo subsystems behind a simple operational surface."""

    def __init__(
        self,
        config: AlphaNodeConfig,
        *,
        base_path: Optional[Path] = None,
        state_store: Optional[StateStore] = None,
        stake_manager: Optional[StakeManager] = None,
        ens_verifier: Optional[ENSVerifier] = None,
        governance: Optional[GovernanceController] = None,
        knowledge: Optional[KnowledgeLake] = None,
        planner: Optional[MuZeroPlanner] = None,
        orchestrator: Optional[AlphaOrchestrator] = None,
        harvester: Optional[TaskHarvester] = None,
        compliance: Optional[ComplianceEngine] = None,
        metrics: Optional[MetricsServer] = None,
    ) -> None:
        self.config = config
        self.base_path = base_path or Path(__file__).resolve().parent.parent
        self.state_store = state_store or StateStore(self.base_path / "state.json")
        ledger_path = self.base_path / "stake_ledger.csv"
        self.stake_manager = stake_manager or StakeManager(config.stake, self.state_store, ledger_path)
        self.ens_verifier = ens_verifier or ENSVerifier(config.ens, self.base_path / "ens_registry.csv")
        self.governance = governance or GovernanceController(config.governance, self.state_store)
        knowledge_path = (self.base_path / config.knowledge.storage_path).resolve()
        self.knowledge = knowledge or KnowledgeLake(knowledge_path, self.state_store)
        self.planner = planner or MuZeroPlanner(config.planner)
        roster = build_specialists(config.specialists)
        self.orchestrator = orchestrator or AlphaOrchestrator(
            planner=self.planner,
            knowledge=self.knowledge,
            specialists=roster,
            store=self.state_store,
        )
        job_registry = JobRegistry((self.base_path / config.jobs.job_source).resolve())
        self.harvester = harvester or TaskHarvester(job_registry, self.state_store)
        self.compliance = compliance or ComplianceEngine(config.compliance, self.state_store, self.stake_manager)
        self.metrics = metrics or MetricsServer(
            config.metrics.listen_host,
            config.metrics.listen_port,
            self.state_store,
        )
        self._metrics_running = False
        self._last_compliance: Optional[ComplianceReport] = None

    # ------------------------------------------------------------------
    def bootstrap(self) -> ComplianceReport:
        """Deposit the minimum stake, verify ENS ownership, and score compliance."""

        if self.config.stake.minimum_stake:
            self.stake_manager.deposit(float(self.config.stake.minimum_stake))
        report = self.compliance.evaluate(self.ens_verifier.verify())
        self._last_compliance = report
        return report

    # ------------------------------------------------------------------
    def run_once(self) -> Optional[ExecutionReport]:
        """Execute a single autonomous planning and execution cycle."""

        jobs = list(self.harvester.harvest())
        if not jobs:
            return None
        report = self.orchestrator.run(jobs)
        total_reward = sum(result.projected_reward for result in report.specialist_outputs.values())
        if total_reward:
            self.stake_manager.accrue_rewards(total_reward * 0.05)
        self._last_compliance = self.compliance.evaluate(self.ens_verifier.verify())
        return report

    # ------------------------------------------------------------------
    def pause(self, reason: str = "operator-request") -> GovernanceStatus:
        status = self.governance.pause_all(reason)
        self._last_compliance = self.compliance.evaluate(self.ens_verifier.verify())
        return status

    # ------------------------------------------------------------------
    def resume(self, reason: str = "operator-resume") -> GovernanceStatus:
        status = self.governance.resume_all(reason)
        self._last_compliance = self.compliance.evaluate(self.ens_verifier.verify())
        return status

    # ------------------------------------------------------------------
    def update_governance(self, address: str) -> GovernanceStatus:
        status = self.governance.rotate_governance(address)
        self._last_compliance = self.compliance.evaluate(self.ens_verifier.verify())
        return status

    # ------------------------------------------------------------------
    def stake(self, amount: float) -> StakeEvent:
        return self.stake_manager.deposit(float(amount))

    # ------------------------------------------------------------------
    def withdraw(self, amount: float) -> StakeEvent:
        return self.stake_manager.slash(float(amount))

    # ------------------------------------------------------------------
    def claim_rewards(self) -> Optional[StakeEvent]:
        return self.stake_manager.restake_rewards()

    # ------------------------------------------------------------------
    def run_safety_drill(self) -> None:
        self.pause("drill")
        self.resume("drill-complete")

    # ------------------------------------------------------------------
    def compliance_report(self) -> ComplianceReport:
        report = self.compliance.evaluate(self.ens_verifier.verify())
        self._last_compliance = report
        return report

    # ------------------------------------------------------------------
    def state_snapshot(self) -> NodeState:
        return self.state_store.read()

    # ------------------------------------------------------------------
    def start_metrics(self) -> None:  # pragma: no cover - network IO
        if not self._metrics_running:
            self.metrics.start()
            self._metrics_running = True

    # ------------------------------------------------------------------
    def shutdown(self) -> None:
        if self._metrics_running:
            self.metrics.stop()
            self._metrics_running = False

    # ------------------------------------------------------------------
    @property
    def last_compliance(self) -> Optional[ComplianceReport]:
        return self._last_compliance


__all__ = ["AlphaNode"]
