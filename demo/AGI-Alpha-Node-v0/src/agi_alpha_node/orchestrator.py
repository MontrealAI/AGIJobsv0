from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .blockchain import BlockchainClient, BlockchainState
from .compliance import ComplianceEngine, ComplianceReport
from .config import Config
from .governance import GovernanceController
from .jobs import JobManager
from .knowledge import KnowledgeLake
from .logging_utils import configure_logging, json_log
from .metrics import MetricsRegistry, MetricsServer
from .planner import Planner
from .safety import AntifragilityDrillRunner, SafetyController
from .scheduler import RepeatingTask
from .specialists import BiotechSpecialist, FinanceSpecialist, ManufacturingSpecialist, Specialist


@dataclass
class OrchestratorComponents:
    blockchain: BlockchainClient
    knowledge: KnowledgeLake
    planner: Planner
    specialists: Dict[str, Specialist]
    job_manager: JobManager
    metrics: MetricsRegistry
    metrics_server: MetricsServer
    safety_controller: SafetyController
    antifragility_runner: AntifragilityDrillRunner
    governance: GovernanceController
    compliance_engine: ComplianceEngine


class Orchestrator:
    def __init__(self, config: Config, state_path: Optional[Path] = None) -> None:
        self.config = config
        self.state_path = state_path or Path("demo/AGI-Alpha-Node-v0/state")
        self.state_path.mkdir(parents=True, exist_ok=True)
        self.components = self._build_components()
        self._cycle_task = RepeatingTask(60, self.run_cycle, "agi-cycle")
        self._drill_task = RepeatingTask(
            self.config.orchestrator.antifragility_interval_minutes * 60,
            self._run_antifragility,
            "agi-antifragility",
        )
        self._lock = threading.Lock()
        self._latest_drill: Dict[str, object] = {"drills": []}

    def _write_json(self, name: str, payload: Dict[str, object]) -> None:
        path = self.state_path / name
        path.write_text(json.dumps(payload, indent=2))

    def _run_antifragility(self) -> None:
        result = self.components.antifragility_runner.run_all()
        self._latest_drill = result
        self._write_json("antifragility.json", result)

    def _build_components(self) -> OrchestratorComponents:
        configure_logging(self.config.observability.log_path)
        knowledge = KnowledgeLake(
            storage_path=self.config.knowledge_lake.storage_path,
            retention_days=self.config.knowledge_lake.retention_days,
            max_entries=self.config.knowledge_lake.max_entries,
        )
        metrics = MetricsRegistry()
        blockchain = BlockchainClient(self.config, BlockchainState())
        planner = Planner(config=self.config.planner, knowledge=knowledge, metrics=metrics)
        specialists: Dict[str, Specialist] = {}
        if self.config.specialists.finance.enabled:
            specialists["finance"] = FinanceSpecialist(knowledge)
        if self.config.specialists.biotech.enabled:
            specialists["biotech"] = BiotechSpecialist(knowledge)
        if self.config.specialists.manufacturing.enabled:
            specialists["manufacturing"] = ManufacturingSpecialist(knowledge)
        job_manager = JobManager(self.config, blockchain, planner, specialists, metrics)
        metrics_server = MetricsServer(metrics, self.config.observability.metrics_port)
        safety_controller = SafetyController(self.config, blockchain)
        antifragility_runner = AntifragilityDrillRunner(self.config, blockchain)
        governance = GovernanceController(self.config, blockchain)
        compliance_engine = ComplianceEngine(
            config=self.config,
            blockchain=blockchain,
            job_manager=job_manager,
            planner=planner,
            knowledge=knowledge,
        )
        metrics_server.start()
        json_log("orchestrator_bootstrap", specialists=list(specialists))
        return OrchestratorComponents(
            blockchain=blockchain,
            knowledge=knowledge,
            planner=planner,
            specialists=specialists,
            job_manager=job_manager,
            metrics=metrics,
            metrics_server=metrics_server,
            safety_controller=safety_controller,
            antifragility_runner=antifragility_runner,
            governance=governance,
            compliance_engine=compliance_engine,
        )

    def run_cycle(self) -> None:
        with self._lock:
            self.components.safety_controller.enforce()
            outcomes = self.components.job_manager.execute_cycle()
            total_reward = sum(outcome.reward for outcome in outcomes)
            self.components.metrics.inc_counter("agi_alpha_node_cycles", 1)
            self.components.metrics.set_gauge("agi_alpha_node_total_reward", total_reward)
            json_log("orchestrator_cycle", total_reward=total_reward, jobs=[o.job_id for o in outcomes])
            status_payload = self.status()
            self._write_json("status.json", status_payload)
            if not self._latest_drill["drills"]:
                self._write_json("antifragility.json", self._latest_drill)

    def start(self) -> None:
        json_log("orchestrator_start")
        self._run_antifragility()
        self.run_cycle()
        self._cycle_task.start()
        self._drill_task.start()

    def stop(self) -> None:
        json_log("orchestrator_stop")
        self._cycle_task.stop()
        self._drill_task.stop()
        self.components.metrics_server.stop()

    def status(self) -> Dict[str, object]:
        snapshot = self.components.safety_controller.collect_snapshot()
        return {
            "ens_verified": snapshot.ens_verified,
            "stake_sufficient": snapshot.stake_sufficient,
            "paused": snapshot.paused,
            "governance_address": snapshot.governance_address,
            "active_jobs": self.components.job_manager.active_jobs(),
            "risk_tolerance": self.components.planner.config.risk_tolerance,
        }

    def run_compliance(self) -> ComplianceReport:
        with self._lock:
            report = self.components.compliance_engine.run()
            self._write_json(
                "compliance.json",
                {
                    "overall_score": report.overall_score,
                    "dimensions": [
                        {"name": d.name, "score": d.score, "rationale": d.rationale}
                        for d in report.dimensions
                    ],
                },
            )
            return report

    def governance(self) -> GovernanceController:
        return self.components.governance

    def metrics_snapshot(self) -> str:
        return self.components.metrics.render()


__all__ = ["Orchestrator", "OrchestratorComponents"]
