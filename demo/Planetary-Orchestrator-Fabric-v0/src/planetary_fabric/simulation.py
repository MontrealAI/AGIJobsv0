"""Simulation utilities for acceptance criteria drills."""
from __future__ import annotations

import random
from typing import Dict

from .config import load_scenario
from .job_models import NodeHealth
from .orchestrator import PlanetaryOrchestratorFabric


def high_load_shard_test(job_count: int = 10000) -> Dict[str, object]:
    config = load_scenario("k2-benchmark", overrides={"job_count": job_count})
    fabric = PlanetaryOrchestratorFabric(checkpoint_path=config.checkpoint_path)
    fabric.bootstrap_demo_nodes()
    fabric.bootstrap_jobs(config.job_count, shards=config.shards)
    # Introduce failure mid-way by marking a node offline
    halfway = config.job_count // 2
    completed = 0
    while completed < config.job_count:
        assignments = fabric.dispatch_once()
        if not assignments:
            break
        for assignment in assignments:
            node = fabric.marketplace.get_node(assignment.node_id)
            if node and node.current_load > node.capacity:
                node.health = NodeHealth.DEGRADED
            if completed == halfway:
                # Simulate node outage
                failure_node = fabric.marketplace.get_node("earth-gpu-1")
                if failure_node:
                    failure_node.health = NodeHealth.OFFLINE
            if random.random() < config.completion_probability:
                fabric.complete_job(
                    assignment.job_id,
                    {"result": f"Completed {assignment.job_id}"},
                    latency_ms=random.randint(50, 1500),
                )
                completed += 1
            else:
                fabric.fail_job(assignment.job_id, "simulated failure")
    stats = {
        "metrics": fabric.metrics.serialize(),
        "queue_depths": {shard.value: reg.queue_depth() for shard, reg in fabric.registry.registries.items()},
        "health": fabric.health_report(),
    }
    stats["success_ratio"] = (
        fabric.metrics.completed_jobs / max(1, fabric.metrics.dispatched_jobs)
    )
    return stats


def orchestrator_kill_and_resume(job_count: int = 10000) -> Dict[str, object]:
    config = load_scenario("resilience-drill", overrides={"job_count": job_count})
    fabric = PlanetaryOrchestratorFabric(checkpoint_path=config.checkpoint_path)
    fabric.bootstrap_demo_nodes()
    fabric.bootstrap_jobs(config.job_count, shards=config.shards)
    # Run first half and checkpoint
    for _ in range(job_count // 2):
        fabric.dispatch_once()
    checkpoint_path = fabric.save_checkpoint()
    # Simulate kill by reinstantiating orchestrator
    resumed_fabric = PlanetaryOrchestratorFabric(checkpoint_path=checkpoint_path)
    resumed_fabric.load_checkpoint()
    while any(reg.queue_depth() > 0 for reg in resumed_fabric.registry.registries.values()):
        assignments = resumed_fabric.dispatch_once()
        if not assignments:
            break
        for assignment in assignments:
            resumed_fabric.complete_job(
                assignment.job_id,
                {"result": f"Completed {assignment.job_id}"},
                latency_ms=random.randint(50, 1500),
            )
    return {
        "metrics": resumed_fabric.metrics.serialize(),
        "checkpoint": checkpoint_path,
        "loaded_from_checkpoint": True,
    }
