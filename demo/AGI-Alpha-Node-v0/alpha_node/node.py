"""High-level runtime facade for the AGI Alpha Node demo."""
from __future__ import annotations

from dataclasses import asdict
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
        self._last_autopilot: Optional[dict] = None

    # ------------------------------------------------------------------
    def bootstrap(self) -> ComplianceReport:
        """Deposit the minimum stake, verify ENS ownership, and score compliance."""

        if self.config.stake.minimum_stake:
            self.stake_manager.deposit(float(self.config.stake.minimum_stake))
        return self.activate(auto_top_up=False)

    # ------------------------------------------------------------------
    def activate(self, *, auto_top_up: bool = True) -> ComplianceReport:
        """Ensure ENS verification passes and the minimum stake is locked."""

        ens_result = self.ens_verifier.verify()
        if not ens_result.verified:
            raise ValueError(
                "ENS verification failed; ensure the domain resolves to the operator address"
            )

        state = self.state_store.read()
        required = float(self.config.stake.minimum_stake)
        locked = float(state.stake_locked)
        deficit = max(0.0, required - locked)
        if deficit > 0:
            if not auto_top_up:
                raise ValueError(
                    f"Stake below minimum by {deficit:.2f} {self.config.stake.asset_symbol}"
                )
            self.stake_manager.deposit(deficit)

        report = self.compliance.evaluate(ens_result)
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
    def update_stake_policy(
        self, *, minimum_stake: Optional[float] = None, restake_threshold: Optional[float] = None
    ) -> dict[str, float]:
        if minimum_stake is not None:
            self.config.stake.minimum_stake = float(minimum_stake)
            self.stake_manager.settings.minimum_stake = float(minimum_stake)
        if restake_threshold is not None:
            self.config.stake.restake_threshold = float(restake_threshold)
            self.stake_manager.settings.restake_threshold = float(restake_threshold)
        return {
            "minimum_stake": float(self.config.stake.minimum_stake),
            "restake_threshold": float(self.config.stake.restake_threshold),
        }

    # ------------------------------------------------------------------
    def run_safety_drill(self) -> None:
        self.pause("drill")
        self.resume("drill-complete")

    # ------------------------------------------------------------------
    def autopilot(
        self,
        *,
        cycles: int = 3,
        restake: bool = True,
        safety_interval: int = 2,
    ) -> dict[str, object]:
        """Execute repeated cycles with optional restaking and safety drills."""

        executed: list[dict[str, object]] = []
        safety_drills = 0
        for cycle in range(1, cycles + 1):
            report = self.run_once()
            if report:
                executed.append(
                    {
                        "cycle": cycle,
                        "decisions": [asdict(item) for item in report.decisions],
                        "specialists": {k: asdict(v) for k, v in report.specialist_outputs.items()},
                    }
                )
                self.state_store.append_audit(
                    f"autopilot-cycle-{cycle}: executed {len(report.decisions)} decisions"
                )
                if restake:
                    self.claim_rewards()
            if safety_interval and cycle % safety_interval == 0:
                self.run_safety_drill()
                safety_drills += 1

        compliance = self.compliance_report()
        payload = {
            "cycles": cycles,
            "executed_cycles": len(executed),
            "safety_drills": safety_drills,
            "reports": executed,
            "compliance": asdict(compliance),
        }
        self._last_autopilot = payload
        return payload

    # ------------------------------------------------------------------
    def compliance_report(self) -> ComplianceReport:
        report = self.compliance.evaluate(self.ens_verifier.verify())
        self._last_compliance = report
        return report

    # ------------------------------------------------------------------
    def state_snapshot(self) -> NodeState:
        return self.state_store.read()

    # ------------------------------------------------------------------
    def dashboard_payload(self) -> dict[str, object]:
        report = self.compliance_report()
        ens_result = self.ens_verifier.verify()
        stake_events = [asdict(event) for event in self.stake_manager.events()]
        payload: dict[str, object] = {
            "state": asdict(self.state_store.read()),
            "compliance": {
                "overall": report.overall,
                "dimensions": {k: asdict(v) for k, v in report.dimensions.items()},
            },
            "ens": asdict(ens_result),
            "stake_ledger": stake_events,
        }
        if self._last_autopilot is not None:
            payload["autopilot"] = self._last_autopilot
        return payload

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
