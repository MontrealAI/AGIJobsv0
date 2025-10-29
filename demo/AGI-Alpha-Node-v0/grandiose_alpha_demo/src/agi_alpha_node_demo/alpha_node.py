"""Top-level orchestrator tying all components together."""
from __future__ import annotations

import random
import threading
from dataclasses import asdict
from typing import Dict

from .compliance import ComplianceScorecard
from .config import AlphaNodeConfig
from .economy import EconomyEngine
from .governance import GovernanceController
from .identity import ENSVerificationResult, ENSVerifier
from .knowledge import KnowledgeLake
from .logging_utils import log
from .metrics import MetricsRegistry, MetricsServer
from .orchestrator import Orchestrator
from .planner import MuZeroPlanner


class AlphaNode:
    """Self-contained demo node."""

    def __init__(self, config: AlphaNodeConfig) -> None:
        self._config = config
        self._ens = ENSVerifier()
        self._governance = GovernanceController(
            owner_address=config.governance.owner_address,
            governance_address=config.governance.governance_address,
        )
        self._economy = EconomyEngine(config.economy)
        self._knowledge = KnowledgeLake(config.knowledge)
        self._planner = MuZeroPlanner(config.intelligence)
        self._orchestrator = Orchestrator(self._planner, self._knowledge)
        self._compliance = ComplianceScorecard(config.compliance)
        self._metrics_registry = MetricsRegistry()
        self._metrics_server = MetricsServer(config.metrics.host, config.metrics.port, self._metrics_registry)
        self._register_metrics()
        self._lock = threading.Lock()
        self._ens_result: ENSVerificationResult | None = None

    def _register_metrics(self) -> None:
        self._metrics_registry.register("economy", lambda: {"stake": self._economy.state.stake.amount})
        self._metrics_registry.register("governance", lambda: {"paused": float(self._governance.state.paused)})
        self._metrics_registry.register(
            "compliance",
            lambda: {
                "score": self._compliance.compute(
                    self._latest_ens_result(),
                    self._economy,
                    self._governance,
                    self._planner,
                ).overall
            },
        )

    def _latest_ens_result(self) -> ENSVerificationResult:
        if self._ens_result is None:
            self._ens_result = self._perform_ens_verification()
        return self._ens_result

    def _perform_ens_verification(self) -> ENSVerificationResult:
        self._ens.register(self._config.ens_domain, self._config.operator_address)
        return self._ens.verify(self._config.ens_domain, self._config.operator_address)

    def start(self) -> None:
        self._metrics_server.start()
        self._ens_result = self._perform_ens_verification()
        log("node_started", config=self._config.metadata, ens_owner=self._ens_result.owner)

    def run_job_cycle(self, job: str | None = None) -> Dict[str, object]:
        with self._lock:
            self._ens_result = self._perform_ens_verification()
            if not self._ens_result.is_verified:
                raise RuntimeError("ENS ownership verification failed")
            if self._governance.state.paused:
                raise RuntimeError("Operations are paused by governance")

            self._economy.accrue_rewards()
            plan_result = self._orchestrator.run_cycle(job or self._random_job())
            reinvested = self._economy.reinvest_rewards()
            compliance_snapshot = self._compliance.compute(self._ens_result, self._economy, self._governance, self._planner)

            log(
                "job_cycle",
                job=job,
                reinvested=reinvested,
                plan_roi=plan_result.plan.projected_roi,
                compliance=compliance_snapshot.overall,
            )
            return {
                "plan": [asdict(step) for step in plan_result.plan.steps],
                "specialists": {name: asdict(output) for name, output in plan_result.specialist_outputs.items()},
                "aggregate_score": plan_result.aggregate_score,
                "reinvested": reinvested,
                "compliance": compliance_snapshot.overall,
            }

    def pause(self) -> None:
        self._governance.pause_all()
        log("pause_engaged", governance=self._governance.export_state())

    def resume(self) -> None:
        self._governance.resume_all()
        log("pause_released", governance=self._governance.export_state())

    def _random_job(self) -> str:
        catalogue = [
            "Capital raise for orbital factory",
            "Bio-compute lattice optimisation",
            "Autonomous supply chain calibration",
        ]
        return random.choice(catalogue)

    def export_state(self) -> Dict[str, object]:
        return {
            "config": asdict(self._config),
            "governance": self._governance.export_state(),
            "economy": self._economy.export_state(),
            "metrics": self._metrics_server.export_state(),
        }
