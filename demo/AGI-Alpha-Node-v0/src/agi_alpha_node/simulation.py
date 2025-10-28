from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .blockchain import BlockchainClient, BlockchainState
from .config import Config
from .jobs import JobManager
from .knowledge import KnowledgeLake
from .metrics import MetricsRegistry
from .planner import Planner
from .specialists import BiotechSpecialist, FinanceSpecialist, ManufacturingSpecialist


@dataclass
class SimulationResult:
    rewards: float
    completed_jobs: List[str]
    metrics_snapshot: str


def build_demo_components(config: Config) -> Dict[str, object]:
    knowledge = KnowledgeLake(
        storage_path=config.knowledge_lake.storage_path,
        retention_days=config.knowledge_lake.retention_days,
        max_entries=config.knowledge_lake.max_entries,
    )
    metrics = MetricsRegistry()
    blockchain = BlockchainClient(config=config, state=BlockchainState())
    planner = Planner(config=config.planner, knowledge=knowledge, metrics=metrics)
    specialists = {
        "finance": FinanceSpecialist(knowledge),
        "biotech": BiotechSpecialist(knowledge),
        "manufacturing": ManufacturingSpecialist(knowledge),
    }
    job_manager = JobManager(config=config, blockchain=blockchain, planner=planner, specialists=specialists, metrics=metrics)
    return {
        "knowledge": knowledge,
        "metrics": metrics,
        "blockchain": blockchain,
        "planner": planner,
        "specialists": specialists,
        "job_manager": job_manager,
    }


def run_simulation(config: Config, cycles: int = 1) -> SimulationResult:
    components = build_demo_components(config)
    job_manager: JobManager = components["job_manager"]
    metrics: MetricsRegistry = components["metrics"]
    total_reward = 0.0
    completed_jobs: List[str] = []
    for _ in range(cycles):
        outcomes = job_manager.execute_cycle()
        total_reward += sum(outcome.reward for outcome in outcomes)
        completed_jobs.extend(outcome.job_id for outcome in outcomes)
    metrics_snapshot = metrics.render()
    return SimulationResult(rewards=total_reward, completed_jobs=completed_jobs, metrics_snapshot=metrics_snapshot)
