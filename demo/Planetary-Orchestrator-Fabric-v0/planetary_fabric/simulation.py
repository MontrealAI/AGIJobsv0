"""High-level demo scenarios for the Planetary Orchestrator Fabric."""
from __future__ import annotations

import asyncio
import random
import statistics
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from .config import DemoJobPayload, NodeConfig, RegionConfig, SimulationConfig
from .jobs import Job
from .orchestrator import PlanetaryOrchestrator


@dataclass
class SimulationResult:
    completion_rate: float
    shard_depths: Dict[str, List[int]]
    reassigned_jobs: int
    total_runtime: float
    total_jobs: int

    def max_depth_delta(self) -> int:
        if not self.shard_depths:
            return 0
        latest = [stats[-1] for stats in self.shard_depths.values() if stats]
        if not latest:
            return 0
        min_depth = min(latest)
        max_depth = max(latest)
        return max_depth - min_depth

    def average_depth(self, region: str) -> float:
        depths = [value for value in self.shard_depths.get(region, []) if value is not None]
        return statistics.mean(depths) if depths else 0.0


async def _populate_jobs(
    orchestrator: PlanetaryOrchestrator,
    job_count: int,
    regions: Iterable[str],
    rng: random.Random,
) -> None:
    regions_cycle = list(regions)
    for i in range(job_count):
        region = regions_cycle[i % len(regions_cycle)]
        payload = DemoJobPayload(
            description=f"Autonomous task #{i} for {region}",
            complexity=rng.choice(["low", "medium", "high"]),
            reward=f"{5 + (i % 3)}.0 ETH",
            metadata={"kardashev": "II", "category": rng.choice(["science", "logistics", "governance"])}
        )
        job = Job(job_id=f"job-{i}", region=region, payload=payload, priority=i % 5)
        await orchestrator.register_job(job)


async def _prepare_orchestrator(config: SimulationConfig, resume: bool = False) -> PlanetaryOrchestrator:
    orchestrator = await PlanetaryOrchestrator.from_checkpoint(
        regions=list(config.regions),
        checkpoint=config.checkpoint,
        rebalance_interval=config.rebalance_interval,
        heartbeat_interval=config.heartbeat_interval,
    )
    for node_cfg in config.nodes:
        await orchestrator.register_node(node_cfg)
    await orchestrator.start()
    return orchestrator


async def run_high_load_simulation(
    base_dir: Path,
    job_count: int = 3_000,
    kill_and_resume: bool = True,
    seed: int | None = 1337,
) -> SimulationResult:
    """Execute a canonical scenario showing resilience under load."""

    rng = random.Random(seed)
    config = SimulationConfig.demo(base_dir)
    orchestrator = await _prepare_orchestrator(config)
    shard_metrics: Dict[str, List[int]] = {region.name: [] for region in config.regions}

    await _populate_jobs(orchestrator, job_count, [r.name for r in config.regions], rng)

    async def record_metrics() -> None:
        while True:
            await asyncio.sleep(0.2)
            snapshot = orchestrator.snapshot()
            for region, data in snapshot["shards"].items():
                shard_metrics[region].append(data["queued_jobs"])

    monitor_task = asyncio.create_task(record_metrics())

    if kill_and_resume:
        await asyncio.sleep(config.kill_after_seconds)
        await orchestrator.shutdown(persist_state=True)
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass
        orchestrator = await _prepare_orchestrator(config, resume=True)
        shard_metrics = {region.name: [] for region in config.regions}
        monitor_task = asyncio.create_task(record_metrics())

    await orchestrator.wait_for_all(timeout=120.0)
    await asyncio.sleep(0.1)
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass

    snapshot = orchestrator.snapshot()
    await orchestrator.shutdown()

    return SimulationResult(
        completion_rate=snapshot["metrics"]["completion_rate"],
        shard_depths=shard_metrics,
        reassigned_jobs=snapshot["metrics"]["reassigned_jobs"],
        total_runtime=snapshot["metrics"]["runtime_seconds"],
        total_jobs=snapshot["metrics"]["total_jobs"],
    )


def run_high_load_blocking(
    base_dir: Path,
    job_count: int = 3_000,
    kill_and_resume: bool = True,
    seed: int | None = 1337,
) -> SimulationResult:
    return asyncio.run(
        run_high_load_simulation(
            base_dir,
            job_count=job_count,
            kill_and_resume=kill_and_resume,
            seed=seed,
        )
    )


__all__ = ["SimulationResult", "run_high_load_simulation", "run_high_load_blocking"]
