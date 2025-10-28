from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Dict, Iterable, List

try:  # pragma: no cover - optional dependency for rich rendering
    from rich.table import Table  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - exercised in minimal environments
    class Table:  # type: ignore
        def __init__(self, title: str | None = None) -> None:
            self.title = title
            self.rows = []

        def add_column(self, *_args, **_kwargs) -> None:
            return None

        def add_row(self, *args) -> None:
            self.rows.append(args)

        def add_section(self) -> None:
            self.rows.append(("",))

        def __str__(self) -> str:
            return f"Table({self.title!r}, rows={self.rows!r})"

from .blockchain import BlockchainClient
from .config import Config
from .jobs import JobManager
from .knowledge import KnowledgeLake
from .planner import Planner
from .safety import AntifragilityDrillRunner, SafetyController


@dataclass
class ComplianceDimension:
    name: str
    score: float
    rationale: str


@dataclass
class ComplianceReport:
    overall_score: float
    dimensions: List[ComplianceDimension]
    antifragility_report: Dict[str, object]

    def to_table(self) -> Table:
        table = Table(title="AGI Alpha Node Compliance Scorecard")
        table.add_column("Dimension")
        table.add_column("Score", justify="right")
        table.add_column("Rationale")
        for dimension in self.dimensions:
            table.add_row(dimension.name, f"{dimension.score:.2%}", dimension.rationale)
        table.add_section()
        table.add_row("Overall", f"{self.overall_score:.2%}", "Composite score (mean of dimensions)")
        return table


class ComplianceEngine:
    def __init__(
        self,
        config: Config,
        blockchain: BlockchainClient,
        job_manager: JobManager,
        planner: Planner,
        knowledge: KnowledgeLake,
    ) -> None:
        self.config = config
        self.blockchain = blockchain
        self.job_manager = job_manager
        self.planner = planner
        self.knowledge = knowledge
        self.safety_controller = SafetyController(config, blockchain)

    def _identity_score(self) -> ComplianceDimension:
        ens_ok = self.blockchain.verify_ens_domain()
        identity_ready = self.blockchain.verify_identity_prerequisites()
        score = 1.0 if ens_ok and identity_ready else 0.5 if ens_ok else 0.0
        rationale = "ENS verified and identity prerequisites satisfied" if score == 1.0 else "Manual intervention required"
        return ComplianceDimension("Identity & ENS", score, rationale)

    def _staking_score(self) -> ComplianceDimension:
        stake = self.blockchain.get_stake()
        meets = self.blockchain.ensure_minimum_stake()
        ratio = min(1.0, stake / float(self.config.staking.minimum_stake)) if self.config.staking.minimum_stake else 1.0
        score = 0.9 * ratio + (0.1 if meets else 0.0)
        rationale = f"Stake level: {stake:.2f} {self.config.staking.currency_symbol}"
        return ComplianceDimension("Staking & Activation", score, rationale)

    def _governance_score(self) -> ComplianceDimension:
        status = self.safety_controller.collect_snapshot()
        score = 1.0 if not status.paused else 0.8
        rationale = f"Governance at {status.governance_address}; paused={status.paused}"
        return ComplianceDimension("Governance & Safety", score, rationale)

    def _economic_engine_score(self) -> ComplianceDimension:
        active = len(self.job_manager.active_jobs())
        score = 0.7 + min(0.3, active * 0.05)
        rationale = f"Active jobs: {active}; planner risk tolerance {self.planner.config.risk_tolerance:.2f}"
        return ComplianceDimension("Economic Engine", min(1.0, score), rationale)

    def _strategic_intelligence_score(self) -> ComplianceDimension:
        entries = self.knowledge.count()
        score = min(1.0, 0.5 + entries * 0.01)
        rationale = f"Knowledge entries: {entries}"
        return ComplianceDimension("Strategic Intelligence", score, rationale)

    def _antifragility_score(self, drill_report: Dict[str, object]) -> ComplianceDimension:
        successful = all(
            (
                drill.get("stake", 1) > 0
                if drill["drill"] == "slashing"
                else (not drill.get("paused", False))
                if drill["drill"] == "pause_resume"
                else not drill.get("verified", True)
            )
            for drill in drill_report.get("drills", [])
        )
        score = 1.0 if successful else 0.6
        rationale = "Antifragility drills executed successfully" if successful else "Investigate drill anomalies"
        return ComplianceDimension("Antifragility", score, rationale)

    def run(self) -> ComplianceReport:
        drill_runner = AntifragilityDrillRunner(self.config, blockchain=self.blockchain)
        drill_report = drill_runner.run_all()
        dimensions = [
            self._identity_score(),
            self._staking_score(),
            self._governance_score(),
            self._economic_engine_score(),
            self._antifragility_score(drill_report),
            self._strategic_intelligence_score(),
        ]
        overall = statistics.fmean(dimension.score for dimension in dimensions)
        return ComplianceReport(overall_score=overall, dimensions=dimensions, antifragility_report=drill_report)


__all__ = ["ComplianceEngine", "ComplianceReport", "ComplianceDimension"]
